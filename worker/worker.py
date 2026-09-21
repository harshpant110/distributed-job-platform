import os
import redis
from csv_processor import analyze_csv
from job_service import (
    get_job_file_path,
    mark_job_completed,
    mark_job_failed,
    mark_job_processing,
)

REDIS_URL = os.getenv(
    "REDIS_URL",
    "redis://localhost:6379/0",
)

QUEUE_NAME = "job_queue"

redis_client = redis.Redis.from_url(
    REDIS_URL,
    decode_responses=True,
)


def process_jobs():
    print("Worker started. Waiting for jobs...", flush=True)

    while True:
        result = redis_client.brpop(
            QUEUE_NAME,
            timeout=5,
        )

        if result is None:
            continue

        _, job_id = result

        print(
            f"Received job: {job_id}",
            flush=True,
        )

        try:
            mark_job_processing(job_id)

            file_path = get_job_file_path(job_id)

            if file_path is None:
                raise FileNotFoundError(
                    f"Job file path not found for job {job_id}"
                )

            result = analyze_csv(file_path)

            mark_job_completed(job_id, result)

            print(
                f"Finished job: {job_id}",
                flush=True,
            )

        except Exception as exc:
            error_message = str(exc) or exc.__class__.__name__

            print(
                f"Job failed: {job_id}: {error_message}",
                flush=True,
            )

            try:
                mark_job_failed(job_id, error_message)

            except Exception as failure_exc:
                print(
                    f"Could not mark job as FAILED: "
                    f"{job_id}: {failure_exc}",
                    flush=True,
                )

if __name__ == "__main__":
    process_jobs()
