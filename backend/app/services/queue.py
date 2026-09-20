from app.database.redis import redis_client


QUEUE_NAME = "job_queue"


def enqueue_job(job_id: str) -> None:
    redis_client.lpush(QUEUE_NAME, job_id)


def dequeue_job() -> str | None:
    result = redis_client.brpop(QUEUE_NAME, timeout=5)

    if result is None:
        return None

    _, job_id = result

    return job_id