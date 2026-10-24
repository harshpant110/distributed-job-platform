import os

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


UPLOAD_DIRECTORY = Path(
    os.getenv("UPLOAD_DIRECTORY", "/app/uploads")
)
UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
JOB_NOT_FOUND = "Job not found"


async def save_uploaded_file(file: UploadFile, file_path: Path) -> int:
    """Save an upload in chunks and enforce the maximum file size."""
    total_size = 0
    chunk_size = 1024 * 1024

    UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
    file_path.touch()

    def write_chunk(chunk: bytes) -> None:
        with file_path.open("ab") as uploaded_file:
            uploaded_file.write(chunk)

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break

        total_size += len(chunk)
        if total_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="File size exceeds the 10 MB limit",
            )

        await asyncio.to_thread(write_chunk, chunk)

    if total_size == 0:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty",
        )

    return total_size


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
            detail=JOB_NOT_FOUND,
        )

    return job


@router.delete("/{job_id}")
def delete_job(job_id: UUID, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)

    if job is None:
        raise HTTPException(status_code=404, detail=JOB_NOT_FOUND)

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


def serialize_job_event(job: Job) -> dict:
    """Convert a job into the existing SSE event payload."""
    return {
        "id": str(job.id),
        "status": job.status,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": (
            job.completed_at.isoformat() if job.completed_at else None
        ),
        "result": job.result,
        "error": job.error,
    }


async def generate_job_events(job_id: UUID, db: Session):
    """Poll a job and emit SSE data when its status changes."""
    last_status = None

    while True:
        db.expire_all()
        current_job = db.get(Job, job_id)

        if current_job is None:
            yield f"data: {json.dumps({'error': JOB_NOT_FOUND})}\n\n"
            return

        current_status = current_job.status

        if current_status != last_status:
            event = serialize_job_event(current_job)
            yield f"data: {json.dumps(event)}\n\n"
            last_status = current_status

        if current_status in {"COMPLETED", "FAILED"}:
            return

        await asyncio.sleep(0.5)


@router.get("/{job_id}/events")
async def job_events(
    job_id: UUID,
    db: Session = Depends(get_db),
):
    job = db.get(Job, job_id)

    if job is None:
        raise HTTPException(status_code=404, detail=JOB_NOT_FOUND)

    return StreamingResponse(
        generate_job_events(job_id, db),
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
    file_path = UPLOAD_DIRECTORY / f"{uuid4().hex}.csv"
    upload_complete = False
    job_created = False

    try:
        await save_uploaded_file(file, file_path)
        upload_complete = True

        job = Job(
            filename=original_filename,
            file_path=str(file_path),
            status="QUEUED",
        )

        try:
            db.add(job)
            db.commit()
            db.refresh(job)
            job_created = True

            enqueue_job(str(job.id))
            return job

        except Exception as exc:
            db.rollback()
            if job_created:
                try:
                    db.delete(job)
                    db.commit()
                except Exception:
                    db.rollback()

            raise HTTPException(
                status_code=500,
                detail="Failed to create and queue job",
            ) from exc

    finally:
        await file.close()
        if not upload_complete or not job_created:
            file_path.unlink(missing_ok=True)
