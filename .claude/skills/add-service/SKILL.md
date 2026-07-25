---
description: Step-by-step checklist for adding a new microservice to NeoBank
---

# Adding a New NeoBank Microservice

Follow all 8 steps. Each one has a "done when" checkpoint.

---

## Step 1: Choose stack and create directory

```
services/<name>/
├── Dockerfile
├── .env.example
└── src/         (or cmd/ for Go)
```

Recommended stacks:
- Node.js/TS → follow auth-service pattern
- Go → follow account-service pattern
- Python/FastAPI → follow transaction-service pattern

**Done when:** directory exists with Dockerfile and .env.example.

---

## Step 2: Required endpoints (all services must expose these)

```
GET  /health          → { status: "ok", service: "<name>", version: "1.0.0", db: "connected" }
GET  /health/ready    → { status: "ready" }
GET  /metrics         → Prometheus text format
```

For Python FastAPI:
```python
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
```

**Done when:** `curl http://localhost:<port>/health` returns 200.

---

## Step 3: Python-specific pitfalls (CRITICAL)

If using SQLAlchemy with a `Base` class, **never name a column attribute `metadata`** — it is reserved by `DeclarativeBase`:

```python
# WRONG — will crash at import time
metadata = Column(JSONB, nullable=True)

# CORRECT — use extra_data as the attribute, "metadata" as the DB column name
extra_data = Column("metadata", JSONB, nullable=True)
```

If using PostgreSQL enums, **always set `native_enum=False`** to avoid `CREATE TYPE` conflicts on container restart:

```python
# WRONG
status = Column(Enum(MyStatus), nullable=False)

# CORRECT
status = Column(Enum(MyStatus, native_enum=False), nullable=False)
```

And use `checkfirst=True` in `create_all`:
```python
await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
```

---

## Step 4: Add to docker-compose.yml

```yaml
<name>-service:
  build: ./services/<name>-service
  container_name: neobank-<name>
  ports:
    - "<port>:<port>"
  environment:
    - PORT=<port>
    # ...add other vars
  depends_on:
    postgres-<name>:
      condition: service_healthy   # only if service has its own DB
  networks:
    - neobank-network
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:<port>/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

If service needs its own database, add a postgres block too:
```yaml
postgres-<name>:
  image: postgres:15-alpine
  environment:
    POSTGRES_USER: neobank
    POSTGRES_PASSWORD: neobank_secret
    POSTGRES_DB: neobank_<name>
  ports:
    - "<unique-5432-offset>:5432"
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U neobank"]
    interval: 10s
    retries: 5
```

Port conventions so far: auth=5432, accounts=5433, transactions=5434 → use 5435 for new service.

---

## Step 5: Add Nginx route in api-gateway

Edit `infra/nginx/nginx.conf` — add upstream and location:

```nginx
upstream <name>-service {
    server <name>-service:<port>;
}

# Inside server block:
location /api/v1/<name>/ {
    proxy_pass http://<name>-service;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Authorization $http_authorization;
}
```

---

## Step 6: Add Kubernetes manifests

Create `infra/kubernetes/base/<name>-service.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <name>-service
  namespace: neobank
spec:
  replicas: 1
  selector:
    matchLabels:
      app: <name>-service
  template:
    metadata:
      labels:
        app: <name>-service
    spec:
      containers:
      - name: <name>-service
        image: neobank/<name>-service:latest
        ports:
        - containerPort: <port>
        livenessProbe:
          httpGet:
            path: /health
            port: <port>
        readinessProbe:
          httpGet:
            path: /health/ready
            port: <port>
---
apiVersion: v1
kind: Service
metadata:
  name: <name>-service
  namespace: neobank
spec:
  selector:
    app: <name>-service
  ports:
  - port: <port>
    targetPort: <port>
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: <name>-service-hpa
  namespace: neobank
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: <name>-service
  minReplicas: 1
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

Then add to `infra/kubernetes/base/kustomization.yaml` resources list.

---

## Step 7: Add to Helm chart

Add `<name>-service` block to `infra/helm/neobank/values.yaml`:

```yaml
<name>Service:
  enabled: true
  replicaCount: 1
  image:
    repository: neobank/<name>-service
    tag: latest
  service:
    port: <port>
```

Create `infra/helm/neobank/templates/<name>-service.yaml` mirroring an existing template.

---

## Step 8: Add Prometheus scrape target

Edit `infra/monitoring/prometheus/prometheus.yml` — add to `scrape_configs`:

```yaml
- job_name: '<name>-service'
  static_configs:
    - targets: ['<name>-service:<port>']
  metrics_path: '/metrics'
```

Restart Prometheus to pick it up:
```bash
docker compose restart prometheus
```

**Done when:** `http://localhost:9090/targets` shows new target as UP.

---

## Common pitfalls from NeoBank experience

- **Healthcheck on FROM scratch images**: `FROM scratch` has no shell tools — `wget` and `curl` don't exist. Either change to `FROM alpine:3.19` (adds wget via `apk add --no-cache wget`) or `FROM gcr.io/distroless/static`. Use `wget -q --tries=1 -O /dev/null http://localhost:{port}/health` — do NOT use `--spider`, which fails with "Username/Password Authentication Failed" on Gin/FastAPI servers.
- **nginx:alpine healthcheck — localhost resolves to IPv6**: Inside `nginx:alpine`, `localhost` resolves to `::1` but nginx only listens on IPv4 by default → `wget` gets "Connection refused" → Docker marks container unhealthy. Always use `127.0.0.1` explicitly in the HEALTHCHECK line for any nginx-based service.
- **Frontend nginx vs api-gateway**: The frontend Nginx at `services/frontend/nginx.conf` serves only static files. API calls from the React SPA use relative `/api/v1/...` URLs — these only work when the browser accesses the app through the api-gateway (port 8080), which proxies both frontend and backend services. Never tell users to open port 3000; always use port 8080.

## Quick validation

```bash
# Local
curl http://localhost:<port>/health
curl http://localhost:8080/api/v1/<name>/health   # through gateway

# K8s
kubectl logs deployment/<name>-service -n neobank
kubectl exec -it deployment/<name>-service -n neobank -- sh
```
