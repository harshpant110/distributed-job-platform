from pathlib import Path

from app.models.job import Job


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "service": "backend",
    }


def test_invalid_file_type(client):
    response = client.post(
        "/jobs/",
        files={
            "file": (
                "test.txt",
                b"hello world",
                "text/plain",
            )
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Only CSV files are supported"


def test_empty_file(client):
    response = client.post(
        "/jobs/",
        files={
            "file": (
                "empty.csv",
                b"",
                "text/csv",
            )
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Uploaded file is empty"


def test_create_job(client, monkeypatch):
    monkeypatch.setattr(
        "app.api.jobs.enqueue_job",
        lambda job_id: None,
    )

    response = client.post(
        "/jobs/",
        files={
            "file": (
                "test.csv",
                b"name,age\nHarsh,19\n",
                "text/csv",
            )
        },
    )

    assert response.status_code == 201

    data = response.json()

    assert data["filename"] == "test.csv"
    assert data["status"] == "QUEUED"
    assert data["id"] is not None

    uploaded_file = Path(data["file_path"])

    assert uploaded_file.exists()

    uploaded_file.unlink()


def test_create_job_enqueue_failure(client, db_session, monkeypatch):
    def fail_enqueue(job_id):
        raise RuntimeError("Redis unavailable")

    monkeypatch.setattr(
        "app.api.jobs.enqueue_job",
        fail_enqueue,
    )

    response = client.post(
        "/jobs/",
        files={
            "file": (
                "failed-queue.csv",
                b"name,age\nHarsh,19\n",
                "text/csv",
            )
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == (
        "Failed to create and queue job"
    )

    jobs = db_session.query(Job).all()

    assert jobs == []


def test_get_nonexistent_job(client):
    response = client.get(
        "/jobs/00000000-0000-0000-0000-000000000000"
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Job not found"


def test_delete_nonexistent_job(client):
    response = client.delete(
        "/jobs/00000000-0000-0000-0000-000000000000"
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Job not found"


def test_delete_queued_job(client, db_session):
    job = Job(
        filename="queued.csv",
        file_path="/tmp/queued.csv",
        status="QUEUED",
    )

    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    response = client.delete(f"/jobs/{job.id}")

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Only completed or failed jobs can be deleted"
    )


def test_delete_completed_job(client, db_session, tmp_path):
    file_path = tmp_path / "completed.csv"
    file_path.write_text("name,age\nHarsh,19\n")

    job = Job(
        filename="completed.csv",
        file_path=str(file_path),
        status="COMPLETED",
    )

    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    response = client.delete(f"/jobs/{job.id}")

    assert response.status_code == 200
    assert response.json()["message"] == "Job deleted successfully"
    assert response.json()["job_id"] == str(job.id)

    assert not file_path.exists()
