from pathlib import Path
from uuid import UUID, uuid4

import asyncio
import json

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.job import Job
from app.schemas.job import JobResponse
from app.services.queue import enqueue_job


router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"],
)


UPLOAD_DIRECTORY = Path("/app/uploads")
UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.get("/", response_model=list[JobResponse])
def get_jobs(db: Session = Depends(get_db)):
    statement = select(Job).order_by(Job.created_at.desc())

    jobs = db.scalars(statement).all()

    return jobs


@router.get("/{job_id}", response_model=JobResponse)
def get_job(
    job_id: UUID,
    db: Session = Depends(get_db),
):
    job = db.get(Job, job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )

    return job


@router.delete("/{job_id}")
def delete_job(job_id: UUID, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status not in {"COMPLETED", "FAILED"}:
        raise HTTPException(
            status_code=409,
            detail="Only completed or failed jobs can be deleted",
        )

    file_path = Path(job.file_path)

    try:
        if file_path.exists():
            file_path.unlink()

        db.delete(job)
        db.commit()

        return {
            "message": "Job deleted successfully",
            "job_id": str(job_id),
        }

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to delete job",
        ) from exc


@router.get("/{job_id}/events")
async def job_events(
    job_id: UUID,
    db: Session = Depends(get_db),
):
    job = db.get(Job, job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )

    async def event_generator():
        last_status = None

        while True:
            db.expire_all()

            current_job = db.get(Job, job_id)

            if current_job is None:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                break

            current_status = current_job.status

            if current_status != last_status:
                event = {
                    "id": str(current_job.id),
                    "status": current_job.status,
                    "created_at": current_job.created_at.isoformat()
                    if current_job.created_at
                    else None,
                    "started_at": current_job.started_at.isoformat()
                    if current_job.started_at
                    else None,
                    "completed_at": current_job.completed_at.isoformat()
                    if current_job.completed_at
                    else None,
                    "result": current_job.result,
                    "error": current_job.error,
                }

                yield f"data: {json.dumps(event)}\n\n"

                last_status = current_status

            if current_status in {"COMPLETED", "FAILED"}:
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/", response_model=JobResponse, status_code=201)
async def create_job(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Filename is required",
        )

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Only CSV files are supported",
        )

    original_filename = Path(file.filename).name

    stored_filename = f"{uuid4().hex}.csv"
    file_path = UPLOAD_DIRECTORY / stored_filename

    file_content = await file.read()

    if not file_content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty",
        )

    if len(file_content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File size exceeds the 10 MB limit",
        )

    file_path.write_bytes(file_content)

    job = Job(
        filename=original_filename,
        file_path=str(file_path),
        status="QUEUED",
    )
    try:
        db.add(job)
        db.commit()
        db.refresh(job)

        enqueue_job(str(job.id))

        return job

    except Exception as exc:
        db.rollback()

        if file_path.exists():
            file_path.unlink()

        raise HTTPException(
            status_code=500,
            detail="Failed to create and queue job",
        ) from exc
