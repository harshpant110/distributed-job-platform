# Kubernetes Deployment and Operations

## Scope

This guide documents the local JobFlow deployment on k3d. The namespace is `jobflow`. Kubernetes runs the six application services independently of Docker Compose.

This guide does not claim that the local cluster is production-ready.

## Architecture

The deployment contains:

| Component | Kubernetes resource | Purpose |
|---|---|---|
| Frontend | Deployment and Service | Web UI |
| Nginx | Deployment and Service | UI/API reverse proxy and SSE |
| Backend | Deployment and Service | FastAPI endpoints and job creation |
| Worker | Deployment | Asynchronous CSV processing |
| PostgreSQL | Deployment, Service, PVC | Persistent job records and results |
| Redis | Deployment, Service, PVC | Job queue with AOF persistence |

The `uploads-data` PVC is shared between the backend and worker so the worker can access uploaded files.

Configuration resources include the `nginx-config` ConfigMap and `db-credentials` Secret.

## Prerequisites

- Docker Engine
- k3d and kubectl
- A working local cluster with the required images available
- Repository manifests under `k8s/`
- The required `jobflow` namespace and configuration resources

Check the active cluster and namespace:

```bash
kubectl config current-context
kubectl get nodes
kubectl get namespace jobflow
```

Before applying changes, inspect the current state. Do not delete PVCs or recreate the cluster as a troubleshooting shortcut.

## Validate and apply manifests

Validate each manifest against the API server:

```bash
for file in k8s/*.yaml; do
  echo "Validating $file"
  kubectl apply --dry-run=server -f "$file" || exit 1
done
```

Apply resources in dependency order. The namespace and required Secret/ConfigMap must exist before workloads that reference them.

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/redis-pvc.yaml
kubectl apply -f k8s/data-services.yaml
kubectl apply -f k8s/app-services.yaml
kubectl apply -f k8s/frontend-services.yaml
```

Review the manifests before applying them in an existing environment. Applying manifests can trigger rollouts when pod templates change.

## Health and rollout validation

```bash
kubectl get deployments -n jobflow
kubectl get pods -n jobflow -o wide
kubectl get services -n jobflow
kubectl get configmaps,secrets -n jobflow
kubectl get pvc -n jobflow
kubectl wait --for=condition=Available deployment --all \
  -n jobflow --timeout=120s
```

Inspect a specific workload:

```bash
kubectl describe deployment backend -n jobflow
kubectl logs -n jobflow deployment/backend --tail=100
kubectl logs -n jobflow deployment/worker --tail=100
kubectl logs -n jobflow deployment/redis --tail=100
```

For a container restart, inspect both current and previous logs:

```bash
kubectl logs -n jobflow deployment/worker --tail=100
kubectl logs -n jobflow deployment/worker --previous --tail=100
```

`--previous` may not return logs if Kubernetes has no previous container instance available.

## Local access

Start a port-forward in a dedicated terminal:

```bash
kubectl port-forward -n jobflow svc/nginx 8082:80
```

Keep this terminal open. In another terminal, test the endpoints:

```bash
curl -sS -o /dev/null -w 'Dashboard HTTP %{http_code}\n' \
  http://localhost:8082/

curl -sS -o /dev/null -w 'Jobs API HTTP %{http_code}\n' \
  http://localhost:8082/api/jobs/
```

Expected response codes for the validated deployment are HTTP 200.

If the port-forward process exits, open a new terminal and start it again. A port-forward failure alone does not mean that the cluster or application workloads have failed.

## Storage and data protection

The current PVCs are:

- `postgres-data`: 2Gi
- `uploads-data`: 1Gi
- `redis-data`: 1Gi

Check their status:

```bash
kubectl get pvc -n jobflow
kubectl get pv
```

All expected PVCs should be `Bound`.

Redis is configured with append-only file persistence. Verify its runtime configuration:

```bash
kubectl exec -n jobflow deployment/redis -- \
  redis-cli CONFIG GET appendonly

kubectl exec -n jobflow deployment/redis -- \
  redis-cli INFO persistence
```

AOF persistence improves recovery of Redis queue state, but it does not guarantee exactly-once job execution or automatic recovery from every worker failure.

**Never delete a PVC or PV as a routine troubleshooting step.** The local-path storage class may delete the underlying data when a claim is removed. Back up important database and upload data before storage changes.

## End-to-end job validation

1. Open the dashboard at `http://localhost:8082`.
2. Submit a valid CSV.
3. Verify that the job reaches `COMPLETED`.
4. Verify the processing result.
5. Inspect worker logs.
6. Verify that the SSE stream emits the completion event.

Example API checks:

```bash
curl -fsS http://localhost:8082/api/jobs/
```

For a specific job, replace `<JOB_ID>` with its actual ID:

```bash
curl -fsS "http://localhost:8082/api/jobs/<JOB_ID>"
curl -sS -N "http://localhost:8082/api/jobs/<JOB_ID>/events"
```

Do not treat a successful upload or `QUEUED` status as proof that processing completed.

## Secrets and configuration

Database credentials are provided to workloads through the Kubernetes Secret referenced by the manifests. Do not commit secret values, local `.env` files, or password files.

Kubernetes Secret values are Base64-encoded, not inherently encrypted by Base64 itself. Production deployments should configure appropriate encryption at rest, access controls, and a managed secret solution where appropriate.

## Worker reliability limitations

The worker consumes jobs from Redis using a blocking pop operation. The current design does not implement a complete acknowledgement, lease, retry, or dead-letter workflow.

If a worker terminates after removing a job from the queue, the job may not be automatically requeued. A job can remain in `PROCESSING` and require operator investigation.

A Redis restart previously caused a worker connection error and one worker restart. Subsequent processing succeeded. Treat this as a known reliability limitation until controlled failure-recovery tests verify stronger guarantees.

## Local-cluster limitations

- k3d runs Kubernetes nodes inside Docker on the local machine.
- `local-path` storage is not a substitute for replicated, production-grade storage.
- PostgreSQL and Redis are currently single-replica deployments; availability is limited by the local node and storage.
- A local port-forward is for development and validation, not public production access.
- Production deployment requires separate review of backups, monitoring, TLS, access control, resource capacity, storage, and disaster recovery.

## Troubleshooting checklist

1. Check node readiness: `kubectl get nodes`.
2. Check deployment and pod state: `kubectl get deployments,pods -n jobflow`.
3. Check recent events: `kubectl get events -n jobflow --sort-by=.lastTimestamp`.
4. Inspect logs for the affected component.
5. Verify all PVCs remain `Bound`.
6. Verify Redis responds to `redis-cli ping`.
7. Verify backend access through the Nginx port-forward.
8. For stuck jobs, inspect the job record, Redis queue, and worker logs before retrying or modifying data.

Do not delete the namespace, cluster, PVCs, or persistent volumes to resolve an application-level issue.
