from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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

    db.add(job)
    db.commit()
    db.refresh(job)

    enqueue_job(str(job.id))

    return job