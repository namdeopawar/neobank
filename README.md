# NeoBank — Microservices Banking Platform

A production-grade digital banking platform built for hands-on DevOps and Kubernetes training. Every component — services, pipelines, manifests, deployment scripts — is designed to mirror real-world engineering decisions you would encounter in a fintech environment.

**GitHub:** https://github.com/namdeopawar/neobank  
**Docker Hub:** https://hub.docker.com/u/namdeopawar

---

## What you get

| Skill area | What's included |
|---|---|
| Microservices | 4 backend services in 3 different languages, Nginx API gateway |
| Docker | Multi-stage Dockerfiles, Compose stack, healthchecks |
| Kubernetes | Raw manifests, Kustomize overlays, Helm chart, HPA |
| CI/CD | GitHub Actions, GitLab CI, Jenkins — all three pipelines |
| GitOps | ArgoCD Application + AppProject |
| Deployment strategies | Blue/Green and Canary with automated promotion scripts |
| Observability | Prometheus scrape configs + Grafana dashboards |
| Security | Trivy image scanning, Snyk dependency audit, secret detection |

---

## Architecture

```
Browser
   │
   ▼
┌─────────────────────────────────────────┐
│  api-gateway  (Nginx : 8080)            │
│  Rate limiting, routing, TLS termination│
└──┬──────────────┬──────────────┬────────┘
   │              │              │
   ▼              ▼              ▼
auth-service  account-service  transaction-service
(Node/TS:3001) (Go/Gin:3002)   (Python/FastAPI:3003)
   │              │              │
   ▼              ▼              ▼
Postgres:5432  Postgres:5433  Postgres:5434
                               │
                               ▼ (Kafka events)
                         notification-service
                         (Python/FastAPI:3004)

Monitoring: Prometheus:9090  Grafana:3010
Frontend:   React SPA → served via api-gateway
```

All services expose `/health`, `/health/ready`, and `/metrics` on their own port.

---

## Quick start

```bash
# 1. Clone
git clone https://github.com/namdeopawar/neobank.git
cd neobank

# 2. Start infrastructure
docker context use desktop-linux   # macOS Docker Desktop only
docker compose up -d postgres-auth postgres-accounts postgres-transactions redis
# Wait ~15 seconds for DB healthchecks

# 3. Start application services
docker compose up -d auth-service account-service transaction-service notification-service
# Wait ~20 seconds

# 4. Run DB migrations (required on first boot)
docker exec neobank-auth node dist/db/migrate.js

# 5. Start gateway, frontend, and monitoring
docker compose up -d api-gateway frontend prometheus grafana
```

Open **http://localhost:8080** in your browser.

> Use port **8080** (api-gateway), not 3000. The React SPA calls `/api/v1/...` (relative URLs) which only resolve through the gateway.

### Demo credentials

After migrations: `demo@neobank.com` / `Demo@1234!`

---

## Services

| Service | Language | Port | Database | Purpose |
|---|---|---|---|---|
| auth-service | Node.js / TypeScript | 3001 | neobank_auth (Postgres) | JWT auth, users, refresh tokens, audit log |
| account-service | Go / Gin | 3002 | neobank_accounts (Postgres) | Account CRUD, balances, freezing |
| transaction-service | Python / FastAPI | 3003 | neobank_transactions (Postgres) | Deposits, withdrawals, transfers, fees |
| notification-service | Python / FastAPI | 3004 | — (Kafka consumer) | Email/SMS/Push stubs |
| frontend | React / TypeScript | 80 | — | SPA with Inter font, CSS design system |
| api-gateway | Nginx | 8080 | — | Routing + rate limiting |
| prometheus | — | 9090 | — | Metrics scraping |
| grafana | — | 3010 | — | Dashboards (admin / neobank_grafana) |

---

## API reference

See [docs/api.md](docs/api.md) for the full reference. Quick overview:

```
POST /api/v1/auth/register
POST /api/v1/auth/login        → { accessToken, refreshToken, user }
POST /api/v1/auth/refresh
GET  /api/v1/auth/me

POST /api/v1/accounts          → creates checking or savings account
GET  /api/v1/accounts/customer/:id
GET  /api/v1/accounts/:id/balance

POST /api/v1/transactions      → deposit or withdrawal
POST /api/v1/transactions/transfer
GET  /api/v1/transactions/account/:id

POST /api/v1/notifications/transaction
```

---

## Kubernetes deployment

See [docs/kubernetes.md](docs/kubernetes.md) for full detail. Quick reference:

```bash
# Provision a local cluster
./scripts/k8s-setup.sh minikube   # or: kind

# Kustomize (raw manifests)
kubectl apply -k infra/kubernetes/overlays/dev/
kubectl apply -k infra/kubernetes/overlays/staging/
kubectl apply -k infra/kubernetes/overlays/prod/

# Helm
helm install neobank infra/helm/neobank/ --namespace neobank --create-namespace

# GitOps (ArgoCD)
kubectl apply -f infra/argocd/application.yaml

# Deployment strategies
./scripts/deploy-blue-green.sh production v1.0.0
./scripts/deploy-canary.sh auth-service v1.0.0 --auto-promote
```

---

## CI/CD

See [docs/cicd.md](docs/cicd.md) for full detail. Three equivalent pipelines:

| Tool | File | Trigger |
|---|---|---|
| GitHub Actions | `.github/workflows/ci.yml` | Push to main/develop, PRs, `v*` tags |
| GitLab CI | `cicd/gitlab/.gitlab-ci.yml` | Push to any branch |
| Jenkins | `cicd/jenkins/Jenkinsfile` | Kubernetes pod agents |

**GitHub Actions status (live):** tests ✓ · security scan ✓ · builds to `ghcr.io` ✓

All pipelines run: **test → security scan → build images → deploy dev → deploy staging → deploy prod (manual/tag gate)**

---

## Business logic highlights

- **Balances**: `DECIMAL(20,4)` — never floats
- **Savings accounts**: automatically assigned 4.25% APY at creation
- **Transfer fee**: 0.1% (a $1,000 transfer costs $1.00)
- **Transfer ledger**: two DB rows per transfer — debit `TXN…-DR` and credit `TXN…-CR`
- **Account lockout**: 5 failed logins → 15-minute lock
- **Refresh tokens**: UUIDs stored in Postgres (not in the JWT), enabling server-side revocation

---

## Further reading

| Guide | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Service internals, data models, request flows |
| [docs/api.md](docs/api.md) | Full API reference with request/response examples |
| [docs/cicd.md](docs/cicd.md) | Pipeline setup, secrets, debugging CI failures |
| [docs/kubernetes.md](docs/kubernetes.md) | K8s concepts, deployment strategies, scaling |
