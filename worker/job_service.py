from datetime import datetime, timezone
from uuid import UUID

from database import SessionLocal
from models import Job


def mark_job_processing(job_id: str) -> None:
    session = SessionLocal()

    try:
        job = session.get(Job, UUID(job_id))

        if job is None:
            print(f"Job not found: {job_id}", flush=True)
            return

        job.status = "PROCESSING"
        job.started_at = datetime.now(timezone.utc)

        session.commit()

        print(
            f"Job marked as PROCESSING: {job_id}",
            flush=True,
        )

    except Exception:
        session.rollback()
        raise

    finally:
        session.close()