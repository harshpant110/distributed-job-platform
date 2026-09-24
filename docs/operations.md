# Operations and Troubleshooting

## Overview

This document covers the operational procedures for running, inspecting, troubleshooting, and maintaining the V1.2.0 Docker deployment.

The platform is operated through Docker Compose.

---

## Starting the Platform

From the project root:

```bash
docker compose up -d
```

For a rebuild:

```bash
docker compose up -d --build
```

Check service status:

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

---

## Stopping the Platform

Stop the containers:

```bash
docker compose down
```

This removes the containers and network created by Compose but preserves named volumes.

Start the platform again:

```bash
docker compose up -d
```

---

## Removing Persistent Data

To remove containers and named volumes:

```bash
docker compose down -v
```

This removes:

```text
postgres_data
uploads_data
```

and therefore deletes persistent database and uploaded-file data.

Use this command only when the persistent data can be discarded.

---

## Service Status

Check all services:

```bash
docker compose ps
```

A healthy deployment should show:

```text
postgres   healthy
redis      healthy
backend    healthy
worker     running
frontend   running
nginx      running
```

The worker does not currently define a Docker healthcheck, so its expected state is:

```text
Up
```

rather than:

```text
healthy
```

---

## Health Checks

### Backend

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

### Database

```bash
curl -s http://localhost:8080/api/db-health
```

A successful response confirms backend-to-PostgreSQL connectivity.

### Redis

Inspect Redis health directly:

```bash
docker exec job-platform-redis redis-cli ping
```

Expected:

```text
PONG
```

### PostgreSQL

Inspect PostgreSQL readiness:

```bash
docker exec job-platform-postgres \
  pg_isready -U jobuser -d jobdb
```

Expected output indicates:

```text
accepting connections
```

---

## Logs

### All Services

```bash
docker compose logs
```

### Follow Logs

```bash
docker compose logs -f
```

### Backend

```bash
docker compose logs -f backend
```

### Worker

```bash
docker compose logs -f worker
```

### Redis

```bash
docker compose logs -f redis
```

### PostgreSQL

```bash
docker compose logs -f postgres
```

### Nginx

```bash
docker compose logs -f nginx
```

---

## Docker Log Rotation

Application services use Docker's `json-file` logging driver with:

```text
max-size = 10 MB
max-file = 3
```

Configuration:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

This limits uncontrolled container log growth.

---

# Common Problems

## 1. Backend Is Not Healthy

Check:

```bash
docker compose ps
```

Then:

```bash
docker compose logs backend
```

Also test:

```bash
curl http://localhost:8080/api/health
```

If the backend cannot start, inspect:

- Database connectivity
- Redis connectivity
- Environment configuration
- Docker Secret availability
- Python dependency installation

---

## 2. PostgreSQL Is Not Healthy

Check:

```bash
docker compose logs postgres
```

Then:

```bash
docker exec job-platform-postgres \
  pg_isready -U jobuser -d jobdb
```

Verify that the Docker Secret exists:

```bash
ls -l secrets/db_password.txt
```

The Compose configuration expects:

```text
secrets/db_password.txt
```

---

## 3. Redis Is Not Healthy

Check:

```bash
docker compose logs redis
```

Then:

```bash
docker exec job-platform-redis redis-cli ping
```

Expected:

```text
PONG
```

If Redis is unavailable, job creation may fail because the backend cannot enqueue the job.

---

## 4. Jobs Remain in QUEUED

Check Redis:

```bash
docker exec job-platform-redis redis-cli ping
```

Check the worker:

```bash
docker compose ps worker
```

Then inspect worker logs:

```bash
docker compose logs -f worker
```

The worker must be running and able to communicate with:

```text
redis:6379
```

and:

```text
postgres:5432
```

---

## 5. Job Submission Returns HTTP 500

Check the backend logs:

```bash
docker compose logs backend
```

If Redis is unavailable, the API intentionally returns:

```json
{
  "detail": "Failed to create and queue job"
}
```

The reliability mechanism removes the job record and uploaded file rather than leaving an orphaned queued job.

---

## 6. Frontend Cannot Reach the API

Verify Nginx:

```bash
docker compose ps nginx
```

Then:

```bash
docker compose logs nginx
```

Check the backend:

```bash
curl http://localhost:8080/api/health
```

If this succeeds, the Nginx-to-backend path is functioning.

---

## 7. Port Already in Use

If Docker reports that port `8080` or `8081` is already occupied:

```bash
sudo ss -ltnp | grep -E ':8080|:8081'
```

Alternatively:

```bash
docker ps
```

Look for another container publishing the same port.

Stop the conflicting container or change the host port in `compose.yaml`.

---

## 8. Containers Start but the Application Is Unavailable

Check:

```bash
docker compose ps
```

Then inspect:

```bash
docker compose logs nginx
docker compose logs backend
docker compose logs frontend
```

Also verify:

```bash
curl http://localhost:8080/api/health
```

and open:

```text
http://localhost:8081
```

---

# Database Operations

## Access PostgreSQL

Open a PostgreSQL shell:

```bash
docker exec -it job-platform-postgres \
  psql -U jobuser -d jobdb
```

List tables:

```sql
\dt
```

Query jobs:

```sql
SELECT id, filename, status, created_at
FROM jobs;
```

Exit:

```sql
\q
```

---

## Inspect Database Container

```bash
docker exec job-platform-postgres \
  pg_isready -U jobuser -d jobdb
```

The database is persisted using:

```text
postgres_data
```

---

# Redis Operations

## Check Redis

```bash
docker exec job-platform-redis redis-cli ping
```

## Inspect Queue Keys

```bash
docker exec job-platform-redis redis-cli keys '*'
```

## Inspect Queue Length

If the application queue key is known:

```bash
docker exec job-platform-redis \
  redis-cli llen <queue-key>
```

Queue inspection should normally be used for troubleshooting rather than routine operation.

---

# Docker Network Troubleshooting

Inspect the network:

```bash
docker network ls
```

The application network is:

```text
distributed-job-platform_app_network
```

Inspect it:

```bash
docker network inspect distributed-job-platform_app_network
```

This shows the containers attached to the network.

---

## Service Name Resolution

Containers should use Docker service names.

Examples:

```text
postgres
redis
backend
```

Do not replace these with:

```text
localhost
```

inside application containers.

Inside the backend container:

```text
postgres:5432
redis:6379
```

refer to other containers.

---

# Docker Secrets Troubleshooting

Check that the secret file exists:

```bash
ls -l secrets/db_password.txt
```

Inspect whether the secret is mounted inside the backend:

```bash
docker exec job-platform-backend \
  ls -l /run/secrets/db_password
```

The actual password should not be printed into logs or committed to Git.

---

# Container Inspection

Inspect a running container:

```bash
docker inspect job-platform-backend
```

Open a shell:

```bash
docker exec -it job-platform-backend /bin/sh
```

Check environment variables:

```bash
docker exec job-platform-backend env
```

Avoid exposing secret values when sharing command output.

---

# Image Inspection

List project images:

```bash
docker images
```

Inspect an image:

```bash
docker image inspect distributed-job-platform-backend
```

Check image sizes:

```bash
docker images \
  distributed-job-platform-backend \
  distributed-job-platform-worker \
  distributed-job-platform-frontend
```

---

# Production Dependency Check

The backend production image should contain runtime dependencies only.

Verify that pytest is not installed:

```bash
docker exec job-platform-backend \
  python -m pytest --version
```

Expected:

```text
No module named pytest
```

This confirms the separation between:

```text
Runtime dependencies
```

and:

```text
Development/test dependencies
```

---

# Rebuild Procedure

When application code or Dockerfiles change:

```bash
docker compose up -d --build
```

For a complete recreation:

```bash
docker compose down
docker compose up -d --build
```

Check:

```bash
docker compose ps
```

Then validate:

```bash
curl http://localhost:8080/api/health
```

---

# Validation Procedure

After a rebuild, perform the following checks.

### 1. Compose Configuration

```bash
docker compose config
```

### 2. Container Status

```bash
docker compose ps
```

### 3. Backend Health

```bash
curl http://localhost:8080/api/health
```

### 4. Database Health

```bash
curl http://localhost:8080/api/db-health
```

### 5. Redis

```bash
docker exec job-platform-redis redis-cli ping
```

### 6. Frontend

Open:

```text
http://localhost:8081
```

### 7. Test Job

Submit a CSV:

```bash
curl -X POST \
  -F "file=@sample.csv" \
  http://localhost:8080/api/jobs/
```

Then query the returned job ID.

---

# Recovery Procedure

If the deployment is in an unexpected state:

```bash
docker compose down
```

Then:

```bash
docker compose up -d --build
```

Check:

```bash
docker compose ps
```

If the problem persists:

```bash
docker compose logs
```

Do not immediately remove volumes unless persistent data can be discarded.

---

# Destructive Recovery

Only use this when persistent data can be deleted:

```bash
docker compose down -v
```

Then rebuild:

```bash
docker compose up -d --build
```

This creates a fresh PostgreSQL data volume and uploads volume.

---

# Operational Checklist

After deployment:

```text
[ ] docker compose config
[ ] docker compose ps
[ ] PostgreSQL healthy
[ ] Redis healthy
[ ] Backend healthy
[ ] Worker running
[ ] Nginx running
[ ] Frontend running
[ ] /api/health responds
[ ] /api/db-health responds
[ ] Frontend accessible
[ ] Test CSV job completes
```

---

# V1 Operational Characteristics

V1.2.0 provides:

- Container restart policies
- PostgreSQL healthchecks
- Redis healthchecks
- Backend healthcheck
- Service dependency ordering
- Persistent volumes
- Docker Secrets
- CPU limits
- Memory limits
- Docker log rotation
- Internal Docker networking
- Nginx reverse proxy
- Automated API tests
- End-to-end Docker validation

These features establish the operational baseline for the next infrastructure stage.

---

# Future Operational Evolution

The operational model will become more sophisticated as the platform evolves.

## V1 — Docker Compose

```text
Docker Compose
Healthchecks
Volumes
Secrets
Resource limits
Log rotation
```

## V2 — Kubernetes

```text
Deployments
Services
ConfigMaps
Secrets
PersistentVolumes
Readiness probes
Liveness probes
Replica scaling
```

## V3 — CI/CD

```text
Automated tests
Image builds
Image registry
Automated deployment
```

## V4 — Kafka

```text
Event streaming
Consumer groups
Distributed workers
Event-driven processing
```

## V5 — Cloud + Terraform

```text
Infrastructure as Code
Managed services
Cloud networking
Production observability
Automated infrastructure provisioning
```

The operational complexity increases only when the architecture requires it.