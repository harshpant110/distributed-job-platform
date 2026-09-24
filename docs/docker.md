# Docker Implementation

## Overview

Docker is the primary infrastructure technology used by V1 of the Distributed Job Processing Platform.

The application is divided into independent containers so that each major responsibility can be developed, deployed, restarted, and scaled independently.

V1 uses Docker Compose to define and operate the complete multi-container application.

---

## Container Architecture

The platform contains six services:

| Service | Image / Build | Responsibility |
|---|---|---|
| `frontend` | Custom Docker image | React production application |
| `nginx` | `nginx:alpine` | Reverse proxy |
| `backend` | Custom Docker image | FastAPI API |
| `worker` | Custom Docker image | Background CSV processing |
| `postgres` | `postgres:16` | Persistent database |
| `redis` | `redis:7-alpine` | Job queue |

The services are defined in:

```text
compose.yaml
```

---

## Docker Compose

Docker Compose provides:

- Multi-container orchestration
- Service discovery
- Network configuration
- Persistent volumes
- Healthchecks
- Dependency ordering
- Environment configuration
- Docker Secrets
- Resource limits
- Restart policies
- Container logging configuration

The complete application can be started with:

```bash
docker compose up -d
```

For a clean image rebuild:

```bash
docker compose up -d --build
```

---

## Custom Docker Network

The application uses a dedicated bridge network:

```text
distributed-job-platform_app_network
```

Defined in `compose.yaml` as:

```yaml
networks:
  app_network:
    driver: bridge
```

Each application service is connected to this network.

Docker's built-in DNS allows services to communicate using their Compose service names.

For example:

```text
backend → postgres:5432
backend → redis:6379
worker  → postgres:5432
worker  → redis:6379
nginx   → backend:8000
```

This avoids hardcoding container IP addresses.

---

## Port Exposure

Only services that need host access publish ports.

```text
Frontend
8081 → 80

Nginx
8080 → 80
```

The following services remain internal to the Docker network:

```text
Backend    → 8000
PostgreSQL → 5432
Redis      → 6379
Worker
```

This reduces unnecessary host exposure and keeps internal infrastructure behind the reverse proxy.

---

## Backend Dockerfile

The backend uses:

```text
python:3.12-slim
```

The Dockerfile follows this structure:

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .

RUN pip install -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Important Design Decisions

#### Slim Base Image

The application uses `python:3.12-slim` instead of the full Python image to reduce unnecessary packages and image size.

#### Dependency Layer

The dependency file is copied before application source:

```dockerfile
COPY requirements.txt .
RUN pip install -r requirements.txt
```

This allows Docker to reuse the dependency layer when application source code changes without dependency changes.

#### Runtime Configuration

Python bytecode generation is disabled:

```text
PYTHONDONTWRITEBYTECODE=1
```

Python output is configured for immediate container logging:

```text
PYTHONUNBUFFERED=1
```

Pip caching is disabled:

```text
PIP_NO_CACHE_DIR=1
```

---

## Worker Dockerfile

The worker also uses:

```text
python:3.12-slim
```

The worker image installs its runtime dependencies and copies only the files required by the worker process.

Its entrypoint is:

```dockerfile
CMD ["python", "worker.py"]
```

The worker is intentionally separated from the backend so background processing does not run inside the API container.

---

## Frontend Dockerfile

The frontend uses a multi-stage Docker build.

### Stage 1 — Build

```text
node:22-alpine
```

The React application is compiled using Vite.

### Stage 2 — Runtime

```text
nginx:alpine
```

The generated frontend assets are copied into the Nginx web root.

Conceptually:

```text
Node build environment
        ↓
npm ci
        ↓
npm run build
        ↓
dist/
        ↓
Nginx runtime image
```

This keeps Node.js and build dependencies out of the final frontend runtime image.

---

## Dependency Management

Production and development dependencies are separated.

### Production

Backend runtime dependencies:

```text
backend/requirements.txt
```

### Development and Testing

Development dependencies:

```text
backend/requirements-dev.txt
```

The development file extends the runtime dependencies:

```text
-r requirements.txt
pytest==8.4.2
httpx==0.28.1
```

Therefore the production backend image does not install test-only packages.

The production container was explicitly verified to not contain `pytest`.

---

## Docker Build Context

Each application component has its own build context.

```text
backend/
frontend/
worker/
```

This prevents unrelated project files from being sent to each Docker build.

---

## `.dockerignore`

The backend, frontend, and worker each use a `.dockerignore` file.

The purpose is to prevent unnecessary files from entering the Docker build context.

Typical examples include:

```text
.venv/
__pycache__/
.pytest_cache/
.git/
```

This reduces build context size and prevents development artifacts from entering application images.

---

## Docker Volumes

Two named volumes are used.

### PostgreSQL

```yaml
volumes:
  postgres_data:
```

Mounted at:

```text
/var/lib/postgresql/data
```

### Uploaded Files

```yaml
volumes:
  uploads_data:
```

Mounted by the backend and worker at:

```text
/app/uploads
```

This allows the backend to save uploaded files and the worker to access the same files.

---

## Persistence Model

Container lifecycle and data lifecycle are intentionally separated.

```text
Container
   |
   +----> Application process

Named Volume
   |
   +----> Persistent data
```

Recreating containers does not remove the named volumes.

For example:

```bash
docker compose down
docker compose up -d
```

preserves the application data.

Removing the volumes requires:

```bash
docker compose down -v
```

---

## Docker Secrets

The PostgreSQL password is supplied through a Docker Secret.

Compose configuration:

```yaml
secrets:
  db_password:
    file: ./secrets/db_password.txt
```

The secret is mounted inside containers at:

```text
/run/secrets/db_password
```

PostgreSQL uses:

```text
POSTGRES_PASSWORD_FILE
```

instead of putting the password directly into an environment variable.

The backend and worker read the same secret when establishing database connections.

---

## Environment Variables

Non-sensitive configuration is stored in environment variables.

Example:

```env
POSTGRES_DB=jobdb
POSTGRES_USER=jobuser
```

The repository contains:

```text
.env.example
```

The actual `.env` file is ignored by Git.

Sensitive credentials are not stored in `.env`.

---

## Healthchecks

Healthchecks allow Compose to determine whether a service is ready.

### PostgreSQL

PostgreSQL uses:

```text
pg_isready
```

Example:

```yaml
healthcheck:
  test:
    ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
```

### Redis

Redis uses:

```text
redis-cli ping
```

Expected response:

```text
PONG
```

### Backend

The backend healthcheck calls:

```text
http://localhost:8000/health
```

The Python standard library is used for the check:

```text
urllib.request
```

---

## Dependency Ordering

The backend waits for PostgreSQL and Redis to become healthy:

```yaml
depends_on:
  postgres:
    condition: service_healthy
  redis:
    condition: service_healthy
```

Nginx waits for the backend:

```yaml
depends_on:
  backend:
    condition: service_healthy
```

This creates a controlled startup sequence:

```text
PostgreSQL ──┐
             ├──> Backend ──> Nginx
Redis ───────┘

Redis ──> Worker
PostgreSQL ──> Worker
```

---

## Restart Policies

Application services use:

```yaml
restart: unless-stopped
```

This allows Docker to restart containers after failures while still allowing intentional manual shutdown.

---

## Resource Limits

The backend and worker have explicit resource limits.

### Backend

```text
Memory limit: 512 MB
Memory reservation: 256 MB
CPU limit: 0.5 CPU
```

### Worker

```text
Memory limit: 512 MB
Memory reservation: 256 MB
CPU limit: 1.0 CPU
```

The worker receives more CPU capacity because CSV processing is a background compute workload.

Resource limits prevent a single service from consuming unlimited host resources.

---

## Logging

Application containers use Docker's `json-file` logging driver with rotation.

Configuration:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

This limits individual log files to:

```text
10 MB
```

and keeps:

```text
3
```

rotated log files.

This prevents uncontrolled container logs from consuming disk space.

---

## Nginx Reverse Proxy

Nginx is the API entry point.

The frontend sends API requests to:

```text
http://localhost:8080/api
```

Nginx removes the `/api/` prefix and forwards the request to:

```text
backend:8000
```

The configuration also includes:

```text
client_max_body_size 10M
```

which matches the application's 10 MB upload limit.

For Server-Sent Events:

```text
proxy_buffering off
proxy_cache off
proxy_read_timeout 1h
```

These settings support long-lived real-time status connections.

---

## Docker DNS

The application does not use:

```text
localhost
```

for communication between containers.

For example, the backend connects to:

```text
postgres:5432
```

instead of:

```text
localhost:5432
```

Similarly:

```text
redis:6379
```

is used for Redis.

This is an important distinction because `localhost` inside a container refers to that container itself.

Docker Compose provides service-name DNS automatically.

---

## Container Security Boundary

The architecture separates external access from internal services.

```text
                HOST
                  |
        ┌─────────┴─────────┐
        │                   │
     :8081                :8080
        │                   │
    Frontend             Nginx
                            |
                            v
                         Backend
                        /       \
                       v         v
                  PostgreSQL    Redis
                                  |
                                  v
                                Worker
```

Only the intended entry points are published to the host.

---

## Validation Commands

### Validate Compose Configuration

```bash
docker compose config
```

### Check Services

```bash
docker compose ps
```

### Inspect Logs

```bash
docker compose logs
```

### Follow Backend Logs

```bash
docker compose logs -f backend
```

### Inspect Backend Container

```bash
docker exec -it job-platform-backend /bin/sh
```

### Check Backend Health

```bash
curl http://localhost:8080/api/health
```

### Check Database Health

```bash
curl http://localhost:8080/api/db-health
```

---

## V1 Docker Engineering Outcomes

V1 demonstrates practical Docker engineering rather than simply running the application in containers.

The implementation covers:

- Dockerfile design
- Docker image layering
- Build caching
- Multi-stage builds
- `.dockerignore`
- Docker Compose
- Custom bridge networking
- Docker DNS
- Port publishing
- Named volumes
- Bind mounts
- Environment variables
- Docker Secrets
- Healthchecks
- Service dependencies
- Restart policies
- CPU limits
- Memory limits
- Log rotation
- Reverse proxying
- Production/runtime dependency separation

---

## Future Infrastructure Evolution

Docker Compose is intentionally the V1 orchestration layer.

The planned evolution is:

```text
V1
Docker + Docker Compose
        |
        v
V2
Kubernetes
        |
        v
V3
CI/CD
        |
        v
V4
Kafka / Event-Driven Architecture
        |
        v
V5
Terraform + Cloud
```

Each future technology will be introduced to solve a specific infrastructure or scalability requirement rather than being added without a concrete purpose.