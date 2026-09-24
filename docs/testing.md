# Testing and Validation

## Overview

The project uses automated backend tests together with application-level and Docker-level validation.

The testing strategy for V1.2.0 focuses on verifying:

- API behavior
- Input validation
- Job lifecycle behavior
- Job deletion rules
- Queue failure handling
- Production frontend builds
- Docker service health
- Production dependency separation

---

## Testing Stack

The backend test environment uses:

- pytest
- FastAPI TestClient
- SQLAlchemy
- SQLite
- httpx

Development dependencies are kept separate from production dependencies.

Production:

```text
backend/requirements.txt
```

Development/testing:

```text
backend/requirements-dev.txt
```

---

## Test Environment

The automated tests do not require PostgreSQL or Redis to be running.

Tests use a local SQLite database:

```text
sqlite:///./test.db
```

Uploaded test files are stored in:

```text
./test_uploads
```

These test artifacts are excluded from Git.

---

## Test Configuration

The test configuration is located in:

```text
backend/tests/conftest.py
```

The test environment overrides the application's database dependency so that API requests use the SQLite test database.

The test database schema is recreated for each test.

Conceptually:

```text
Start Test
    |
    v
Drop Existing Tables
    |
    v
Create Tables
    |
    v
Run Test
    |
    v
Drop Tables
```

This keeps tests isolated from one another.

---

## Test Suite

The current V1.2.0 backend test suite contains:

```text
9 tests
```

### Test 1 — Health Endpoint

Verifies:

```text
GET /health
```

Expected:

```text
200 OK
```

and:

```json
{
  "status": "healthy",
  "service": "backend"
}
```

---

### Test 2 — Invalid File Type

Attempts to upload a non-CSV file.

Expected:

```text
400 Bad Request
```

with:

```text
Only CSV files are supported
```

This verifies the upload validation layer.

---

### Test 3 — Empty File

Attempts to upload an empty CSV.

Expected:

```text
400 Bad Request
```

with:

```text
Uploaded file is empty
```

---

### Test 4 — Job Creation

Creates a valid CSV processing job.

The test verifies:

- HTTP `201`
- Filename
- Job ID
- Initial `QUEUED` status
- Uploaded file creation

Redis enqueueing is mocked because the test is focused on the API/database behavior.

---

### Test 5 — Queue Enqueue Failure

Simulates Redis failure.

The test replaces the queue function with a failing implementation.

Expected behavior:

```text
Redis enqueue fails
       |
       v
HTTP 500
       |
       v
Job removed
       |
       v
No orphaned database record
```

The test verifies:

```text
500 Internal Server Error
```

and:

```text
Failed to create and queue job
```

It also verifies that the database contains no remaining job.

This test directly protects the queue reliability mechanism introduced in V1.2.0.

---

### Test 6 — Nonexistent Job Lookup

Requests a job ID that does not exist.

Expected:

```text
404 Not Found
```

with:

```text
Job not found
```

---

### Test 7 — Nonexistent Job Deletion

Attempts to delete a nonexistent job.

Expected:

```text
404 Not Found
```

---

### Test 8 — Queued Job Deletion Protection

Creates a job with:

```text
QUEUED
```

status and attempts to delete it.

Expected:

```text
409 Conflict
```

with:

```text
Only completed or failed jobs can be deleted
```

This prevents active jobs from being deleted through the job-management endpoint.

---

### Test 9 — Completed Job Deletion

Creates a completed job with an associated file.

The test verifies:

- HTTP `200`
- Successful deletion message
- Correct job ID
- Database record removal
- Uploaded file removal

---

## Running the Tests

From the project root:

```bash
cd backend
source .venv/bin/activate
pytest -q
```

Expected result:

```text
9 passed
```

---

## Test Result

V1.2.0 validation produced:

```text
9 passed, 2 warnings
```

The warnings originate from dependency deprecations involving FastAPI/Starlette's TestClient and AnyIO.

They did not cause test failures.

---

## Frontend Validation

The frontend is validated using the production Vite build.

From:

```text
frontend/
```

run:

```bash
npm run build
```

A successful build produces:

```text
dist/
```

The V1.2.0 production build completed successfully.

---

## Docker Validation

After the application tests and frontend build pass, the complete Docker application is rebuilt:

```bash
docker compose down
docker compose up -d --build
```

Check the services:

```bash
docker compose ps
```

Expected services:

```text
postgres
redis
backend
worker
frontend
nginx
```

PostgreSQL and Redis should report healthy status.

The backend should report:

```text
healthy
```

---

## Backend Health Validation

Through Nginx:

```bash
curl -s http://localhost:8080/api/health
```

Expected:

```json
{
  "status": "healthy",
  "service": "backend"
}
```

---

## Database Health Validation

```bash
curl -s http://localhost:8080/api/db-health
```

A successful response confirms that the backend can connect to PostgreSQL.

---

## Production Dependency Validation

The production backend image should not contain development-only testing packages.

For example:

```bash
docker exec job-platform-backend python -m pytest --version
```

Expected result:

```text
No module named pytest
```

This confirms that `pytest` remains a development dependency rather than a production runtime dependency.

---

## End-to-End Docker Validation

The complete application is validated by submitting a real CSV through Nginx.

Example:

```bash
curl -X POST \
  -F "file=@sample.csv" \
  http://localhost:8080/api/jobs/
```

The returned job ID can then be checked:

```bash
curl \
  http://localhost:8080/api/jobs/<JOB_ID>
```

The expected lifecycle is:

```text
QUEUED
   ↓
PROCESSING
   ↓
COMPLETED
```

or:

```text
QUEUED
   ↓
PROCESSING
   ↓
FAILED
```

---

## Persistence Validation

Persistence is verified by recreating application containers while preserving named volumes.

Example:

```bash
docker compose down
docker compose up -d
```

The PostgreSQL data should remain available after recreation.

Uploaded files stored in:

```text
uploads_data
```

should also remain available.

---

## Queue Failure Validation

The queue failure mechanism was also tested at the Docker level.

The Redis container can be stopped:

```bash
docker compose stop redis
```

A new job submission should fail rather than creating an orphaned queued job.

Redis can then be restarted:

```bash
docker compose start redis
```

This validates the failure path between:

```text
Backend → Redis
```

---

## Validation Layers

V1.2.0 uses multiple validation layers:

```text
                 Validation
                     |
        ┌────────────┼────────────┐
        |            |            |
        v            v            v
   Unit/API      Build Tests   Docker Tests
     Tests          |             |
        |           |             |
        v           v             v
     Backend     Frontend      Containers
     Behavior     Build         + Network
        |           |             |
        └───────────┼─────────────┘
                    |
                    v
              End-to-End
               Validation
```

---

## What Is Not Tested Yet

The current test suite intentionally focuses on the V1.2.0 scope.

It does not yet provide comprehensive coverage for:

- Kubernetes deployments
- CI/CD pipelines
- Kafka/event processing
- Cloud infrastructure
- Horizontal scaling
- Load testing
- Distributed failure recovery across multiple workers

These areas belong to later stages of the project.

---

## Future Testing Evolution

Testing will evolve alongside the platform.

### V1

```text
pytest
API tests
Docker validation
```

### V2

```text
Kubernetes deployment validation
Health/readiness validation
Container scaling tests
```

### V3

```text
CI pipeline
Automated test execution
Image build validation
```

### V4

```text
Kafka integration tests
Event-processing tests
Consumer failure tests
```

### V5

```text
Infrastructure validation
Cloud integration tests
Deployment verification
```

The goal is to keep automated validation aligned with the infrastructure complexity introduced at each stage.