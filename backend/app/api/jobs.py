from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.services.queue import enqueue_job

from app.database.connection import get_db
from app.models.job import Job
from app.schemas.job import JobResponse


router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"],
)


UPLOAD_DIRECTORY = Path("/app/uploads")
UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)


@router.get("/", response_model=list[JobResponse])
def get_jobs(db: Session = Depends(get_db)):
    statement = select(Job).order_by(Job.created_at.desc())

    jobs = db.scalars(statement).all()

    return jobs


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

    file_path = UPLOAD_DIRECTORY / file.filename

    file_content = await file.read()
    file_path.write_bytes(file_content)

    job = Job(
        filename=file.filename,
        file_path=str(file_path),
        status="QUEUED",
    )

    db.add(job)
    db.commit()
    db.refresh(job)

    enqueue_job(str(job.id))

    return job