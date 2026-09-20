import os
import time

import redis
from job_service import mark_job_processing

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

        # Temporary processing simulation
        time.sleep(2)

        print(
            f"Finished job: {job_id}",
            flush=True,
        )


if __name__ == "__main__":
    process_jobs()