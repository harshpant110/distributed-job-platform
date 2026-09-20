import os
import redis
from csv_processor import analyze_csv
from job_service import (
    get_job_file_path,
    mark_job_completed,
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
        mark_job_processing(job_id)

        file_path = get_job_file_path(job_id)

        if file_path is None:
            continue

        result = analyze_csv(file_path)

        mark_job_completed(job_id, result)

        print(
            f"Finished job: {job_id}",
            flush=True,
        )


if __name__ == "__main__":
    process_jobs()
