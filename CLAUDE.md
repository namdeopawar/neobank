# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**NeoBank** is a realistic digital banking microservices platform built for DevOps / Kubernetes training. It is designed to look and behave like a real production system so you can practice CI/CD, multi-arch deployments, autoscaling, blue/green and canary strategies, GitOps, and observability.

## Commands

### Local Development (Docker Compose)
```bash
# Start everything (builds images, seeds demo data)
./scripts/local-dev.sh start

# Stop
./scripts/local-dev.sh stop

# Wipe all volumes and containers
./scripts/local-dev.sh clean

# Seed demo user + accounts only
./scripts/local-dev.sh seed
```

### Per-Service Development
```bash
# Auth Service (Node.js/TypeScript)
cd services/auth-service
npm ci
npm run dev          # ts-node-dev with hot reload
npm test             # Jest with coverage
npm run lint         # ESLint
npx tsc --noEmit     # Type-check only (no emit)
npm run migrate      # Run DB migrations manually

# Account Service (Go)
cd services/account-service
go run ./cmd/main.go
go test ./... -race
go vet ./...
CGO_ENABLED=0 go build -o /tmp/account-service ./cmd/main.go

# Transaction Service (Python FastAPI)
cd services/transaction-service
pip install -r requirements.txt
uvicorn src.main:app --reload --port 3003
pytest tests/ -v
ruff check src/

# Notification Service (Python FastAPI)
cd services/notification-service
pip install -r requirements.txt
uvicorn src.main:app --reload --port 3004
```

### Kubernetes Deployment
```bash
# Provision a local cluster (minikube or kind)
./scripts/k8s-setup.sh minikube
./scripts/k8s-setup.sh kind

# Deploy with raw Kustomize
kubectl apply -k infra/kubernetes/base/
kubectl apply -k infra/kubernetes/overlays/dev/
kubectl apply -k infra/kubernetes/overlays/staging/
kubectl apply -k infra/kubernetes/overlays/prod/

# Deploy with Helm
helm dependency update infra/helm/neobank/
helm install neobank infra/helm/neobank/ --namespace neobank --create-namespace
helm upgrade neobank infra/helm/neobank/ --namespace neobank

# GitOps (ArgoCD)
kubectl apply -f infra/argocd/application.yaml

# Deployment strategies (for production)
./scripts/deploy-blue-green.sh production v1.2.0
./scripts/deploy-canary.sh auth-service v1.2.0 --auto-promote
```

### Building and Pushing Images
```bash
# Build all images
docker compose build

# Build a single service
docker build -t neobank/auth-service:dev services/auth-service/

# Load into minikube (avoids needing a registry)
minikube image load neobank/auth-service:dev --profile=neobank-training
```

## Architecture

### Services Map

| Service | Language | Port | Database | Purpose |
|---|---|---|---|---|
| `auth-service` | Node.js / TypeScript | 3001 | `neobank_auth` (Postgres) | JWT auth, users, sessions, audit log |
| `account-service` | Go / Gin | 3002 | `neobank_accounts` (Postgres) | Account CRUD, balances, freezing |
| `transaction-service` | Python / FastAPI | 3003 | `neobank_transactions` (Postgres) | Deposits, withdrawals, transfers |
| `notification-service` | Python / FastAPI | 3004 | — | Email/SMS/Push (stub + Kafka consumer) |
| `frontend` | React / TypeScript | 80 | — | SPA served by Nginx |
| `api-gateway` | Nginx | 8080 | — | Routing, rate limiting, TLS termination |

All services expose `/health`, `/health/ready`, and `/metrics` (Prometheus format) on their own port. The API Gateway routes `/api/v1/auth/*`, `/api/v1/accounts/*`, `/api/v1/transactions/*`, `/api/v1/notifications/*` to the respective service.

### Inter-Service Communication

- **Sync**: HTTP/REST between services (auth→account→transaction call chain for business ops)
- **Async**: Kafka topics for transaction events → notification service (wired but stubbed for local dev)
- **Auth propagation**: The `Authorization: Bearer <jwt>` header is forwarded through the Nginx gateway to each downstream service. Services validate locally or call auth-service for verification.

### Data Model Key Points

**auth-service** owns `users`, `refresh_tokens`, and `audit_logs`. JWTs contain `{ userId, email, role }`. Refresh tokens are UUIDs stored in Postgres (not in the JWT), enabling server-side revocation. Account lockout triggers at 5 failed logins for 15 minutes.

**account-service** stores balances as `DECIMAL(20,4)` (not floats). `balance` = total, `available_balance` = balance minus `hold_amount`. The `hold_amount` field supports pending transaction holds.

**transaction-service** generates reference IDs with prefix `TXN` + 13 alphanumeric chars. Transfers create two ledger entries (debit `TXN…-DR` and credit `TXN…-CR`) in the same DB transaction. Fee rates live in `FEE_RATES` dict.

### Infrastructure Layers

```
infra/
├── kubernetes/
│   ├── base/           # Raw manifests (Namespace, Deployments, Services, HPA, Ingress)
│   └── overlays/       # Kustomize patches for dev/staging/prod (replicas, image tags, resource limits)
├── helm/neobank/       # Helm chart wrapping the same workloads (values.yaml drives everything)
├── argocd/             # ArgoCD Application + AppProject for GitOps
├── nginx/              # API Gateway config
└── monitoring/
    └── prometheus/     # Scrape configs for all services + node/postgres exporters
```

Each service has `Deployment + Service + HPA` in K8s. HPAs scale on CPU (65–70%) and memory (80%). The `notification-service` only has 1 replica min since it's stateless and event-driven.

### CI/CD Pipelines

Three equivalent pipelines are provided — pick one for your training:

| Tool | File | Trigger |
|---|---|---|
| GitHub Actions | `.github/workflows/ci.yml` | Push to main/develop, tags `v*` |
| GitLab CI | `cicd/gitlab/.gitlab-ci.yml` | Push to any branch |
| Jenkins | `cicd/jenkins/Jenkinsfile` | Runs on Kubernetes agents |

All pipelines follow the same flow: **test → security scan → build images → deploy dev → deploy staging → deploy prod (manual/tag gate)**.

ArgoCD (`infra/argocd/application.yaml`) provides the GitOps alternative: commit to `main` → ArgoCD auto-syncs staging; commit a tag → ArgoCD syncs production.

### Deployment Strategies (scripts/)

- `deploy-blue-green.sh` — Spins up a second-color deployment for each service, waits for health, then atomically switches the Service selector. Old deployment is scaled to 0 after a 10s drain.
- `deploy-canary.sh` — Steps through `10% → 25% → 50% → 100%`, checking error rate (via Prometheus query stub) at each stage. Rolls back automatically on high error rates. Supports `--auto-promote` for CI.

### Frontend Architecture

SPA at `services/frontend/src/`:
- **`store/`** — Redux Toolkit slices (`authSlice`, `accountSlice`). Auth token persisted to `localStorage`; cleared on logout or 401 response.
- **`services/api.ts`** — Single Axios instance wired with a request interceptor (attaches Bearer token) and a response interceptor (redirects to `/login` on 401).
- **`pages/`** — Route-level components. `DashboardPage` uses React Query for accounts. `TransferPage` is a 3-step wizard (form → confirm → success).
- **`components/Layout.tsx`** — Collapsible sidebar. Active route highlighted via NavLink.

The frontend proxies to `localhost:8080` (the API gateway) in dev via the `proxy` field in `package.json`.

## Key Secrets / Config

All secrets are in `.env.example` files per service. In K8s, they live in `infra/kubernetes/base/secrets.yaml` (plain text for training — in real usage replace with Sealed Secrets, External Secrets Operator, or Vault). Required environment variables per service:

- **auth-service**: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DB_*`, `REDIS_URL`
- **account-service**: `DB_*`, `AUTH_SERVICE_URL`
- **transaction-service**: `DB_*`, `KAFKA_BROKERS`, `ACCOUNT_SERVICE_URL`
- **notification-service**: `KAFKA_BROKERS`, `REDIS_URL`, SMTP/Twilio creds

## Demo Credentials

After running `./scripts/local-dev.sh start`:
- Email: `demo@neobank.com`
- Password: `Demo@1234!`
