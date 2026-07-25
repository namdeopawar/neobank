# NeoBank Architecture

## Overview

NeoBank is a microservices banking platform where each service owns one business domain, runs its own Postgres database, and communicates with other services over HTTP/REST (synchronous) or Kafka (asynchronous). An Nginx API gateway is the single entry point for all external traffic.

---

## Service map

```
                        ┌──────────────────────────────────────────────────┐
                        │  api-gateway (Nginx : 8080)                      │
                        │                                                  │
                        │  /api/v1/auth/*       → auth-service:3001        │
                        │  /api/v1/accounts/*   → account-service:3002     │
                        │  /api/v1/transactions/* → transaction-service:3003│
                        │  /api/v1/notifications/* → notification-service:3004│
                        │  /                    → frontend:80              │
                        └──────────────────────────────────────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                           ▼
    ┌──────────────────┐     ┌──────────────────┐     ┌────────────────────┐
    │  auth-service    │     │ account-service   │     │transaction-service │
    │  Node.js/TypeScript│   │  Go / Gin        │     │  Python / FastAPI  │
    │  Port 3001       │     │  Port 3002        │     │  Port 3003         │
    │                  │     │                   │     │                    │
    │  - JWT issuance  │     │  - Account CRUD   │     │  - Deposits        │
    │  - Registration  │     │  - Balance check  │     │  - Withdrawals     │
    │  - Session mgmt  │     │  - Freeze/unfreeze│     │  - Transfers       │
    │  - Audit log     │     │  - Interest rates │     │  - Fee calculation │
    │  - Rate limiting │     │                   │     │  - Ledger entries  │
    └────────┬─────────┘     └────────┬──────────┘     └─────────┬──────────┘
             │                        │                           │
             ▼                        ▼                           │
    Postgres:5432            Postgres:5433              Postgres:5434
    (neobank_auth)           (neobank_accounts)         (neobank_transactions)
                                                                  │
                                                                  │ Kafka events
                                                                  ▼
                                                      ┌────────────────────┐
                                                      │notification-service│
                                                      │  Python / FastAPI  │
                                                      │  Port 3004         │
                                                      │                    │
                                                      │  - Email (stub)    │
                                                      │  - SMS (stub)      │
                                                      │  - Push (stub)     │
                                                      └────────────────────┘

  Supporting infrastructure:
  Redis:6379        — rate limiting token bucket, session cache
  Kafka:9092        — transaction event bus (local dev: no-op stub)
  Prometheus:9090   — metrics scraping (all services expose /metrics)
  Grafana:3010      — dashboards
```

---

## auth-service (Node.js / TypeScript)

### Responsibilities
- User registration and login
- JWT access token issuance (short-lived, 15m)
- Refresh token management (stored in Postgres, enables server-side revocation)
- Account lockout after 5 failed logins (15-minute lock)
- Per-request audit logging
- Rate limiting via express-rate-limit

### Key files
```
src/
  index.ts                  — Express app + bootstrap (guarded with NODE_ENV !== 'test')
  routes/auth.routes.ts     — Route definitions
  controllers/auth.controller.ts — Business logic
  middleware/auth.middleware.ts  — JWT verification for protected routes
  db/connection.ts          — Postgres pool
  db/migrate.ts             — Schema migration (run manually: docker exec neobank-auth node dist/db/migrate.js)
```

### Data model
```sql
users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  first_name, last_name VARCHAR,
  role VARCHAR DEFAULT 'customer',
  kyc_verified BOOLEAN DEFAULT false,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP,
  last_login TIMESTAMP,
  created_at, updated_at TIMESTAMP
)

refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  token UUID UNIQUE NOT NULL,
  expires_at TIMESTAMP,
  revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMP
)

audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  action VARCHAR,
  ip_address VARCHAR,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP
)
```

### JWT structure
```json
{ "userId": "uuid", "email": "user@example.com", "role": "customer", "iat": 1234, "exp": 1234 }
```
Access tokens expire in 15 minutes. Refresh tokens are UUIDs in the DB — revoking means setting `revoked = true`.

---

## account-service (Go / Gin)

### Responsibilities
- Account creation (checking, savings)
- Balance management (`DECIMAL(20,4)` — never floats)
- Hold management (`hold_amount` for pending transactions)
- Savings accounts automatically get 4.25% APY on creation
- Account freeze/unfreeze

### Key files
```
cmd/main.go                         — Entry point, router setup
internal/handlers/account.handler.go — HTTP handlers
internal/models/account.go          — Account struct, business rules
internal/repository/postgres.go     — DB queries
```

### Data model
```sql
accounts (
  id UUID PRIMARY KEY,
  account_number VARCHAR(20) UNIQUE,   -- e.g. ACC-1234567890
  customer_id UUID NOT NULL,
  account_type VARCHAR,                -- 'checking' | 'savings'
  currency VARCHAR(3) DEFAULT 'USD',
  balance DECIMAL(20,4) DEFAULT 0,
  available_balance DECIMAL(20,4) DEFAULT 0,
  hold_amount DECIMAL(20,4) DEFAULT 0,
  interest_rate DECIMAL(5,4) DEFAULT 0, -- 0.0425 for savings
  status VARCHAR DEFAULT 'active',     -- 'active' | 'frozen' | 'closed'
  created_at, updated_at TIMESTAMP
)
```

### Build notes
- `ENV GOFLAGS=-mod=mod` in Dockerfile — lets Go generate go.sum during build
- go.sum must be regenerated with `golang:1.21-alpine` (same as CI) to avoid version mismatch:
  ```bash
  docker run --rm -v $(pwd)/services/account-service:/app -w /app \
    golang:1.21-alpine sh -c "apk add git && GOFLAGS=-mod=mod go mod tidy"
  ```

---

## transaction-service (Python / FastAPI)

### Responsibilities
- Deposit and withdrawal processing
- Transfer processing with fee deduction
- Double-entry ledger (every transfer = debit row + credit row)
- Transaction history with pagination

### Key files
```
src/
  main.py              — FastAPI app, lifespan (DB table creation)
  models.py            — SQLAlchemy ORM models
  schemas.py           — Pydantic request/response schemas
  database.py          — Postgres connection, session factory
  routers/
    transactions.py    — All business logic
    health.py          — /health, /health/ready, /metrics
```

### Data model
```sql
transactions (
  id UUID PRIMARY KEY,
  reference_id VARCHAR UNIQUE,        -- TXNxxxxxxxxxxxxxxx, or TXNxx...-DR / TXNxx...-CR
  account_id UUID NOT NULL,
  transaction_type VARCHAR,           -- 'deposit' | 'withdrawal' | 'transfer_debit' | 'transfer_credit' | 'fee'
  amount DECIMAL(20,4),
  currency VARCHAR(3),
  balance_before, balance_after DECIMAL(20,4),
  status VARCHAR DEFAULT 'completed', -- 'pending' | 'completed' | 'failed' | 'reversed'
  description TEXT,
  initiated_by UUID,
  extra_data JSONB,                   -- named 'extra_data' in code, stored as 'metadata' in DB
  created_at, updated_at TIMESTAMP
)
```

### Transfer fee calculation
```python
FEE_RATES = { "transfer": 0.001 }   # 0.1%
fee = amount * FEE_RATES["transfer"] # $1000 transfer → $1.00 fee
```
A transfer creates three rows: debit (`TXN…-DR`), credit (`TXN…-CR`), and fee (`TXN…-FEE`).

### Important SQLAlchemy quirks fixed
- `metadata` is a reserved name in `DeclarativeBase` — renamed to `extra_data` with `Column("metadata", JSONB)`
- PostgreSQL enum conflicts on restart — fixed with `native_enum=False` and `checkfirst=True` in `create_all()`

---

## notification-service (Python / FastAPI)

### Responsibilities
- Receives transaction events (via HTTP POST or Kafka consumer)
- Stubs out email / SMS / push notifications
- In production: wire real SMTP, Twilio, and FCM credentials

### Key files
```
src/
  main.py                    — FastAPI app
  schemas.py                 — NotificationRequest schema
  routers/notifications.py   — POST /api/v1/notifications/transaction
  routers/health.py
```

---

## frontend (React / TypeScript)

### Design system
- CSS custom properties, no Tailwind (works without build-time dependencies)
- Inter font via Google Fonts
- SVG icon components (`src/components/Icons.tsx`)
- Dark collapsible sidebar with KYC badge in topbar

### State management
- Redux Toolkit: `authSlice` (token + user in localStorage), `accountSlice`
- React Query for server state (accounts, transactions)
- Axios with interceptors: attaches Bearer token on requests, redirects to `/login` on 401

### Pages
| Page | Route | Key feature |
|---|---|---|
| LoginPage | /login | Split-screen (brand panel + form) |
| RegisterPage | /register | Same split-screen pattern |
| DashboardPage | /dashboard | 4 stat cards + recent transactions table |
| AccountsPage | /accounts | Bank card design with gradient + chip |
| TransactionsPage | /transactions | Tabbed: History \| Deposit |
| TransferPage | /transfer | 3-step wizard (form → confirm → success) |
| ProfilePage | /profile | Avatar card + info table + security settings |

### Critical routing note
Always access via **http://localhost:8080** (api-gateway). Port 3000 serves static files only — relative `/api/v1/...` calls return 404 without the gateway.

---

## api-gateway (Nginx)

Routes all traffic from port 8080:

```nginx
/api/v1/auth/        → proxy to auth-service:3001
/api/v1/accounts/    → proxy to account-service:3002
/api/v1/transactions/ → proxy to transaction-service:3003
/api/v1/notifications/ → proxy to notification-service:3004
/                    → proxy to frontend:80
```

Also handles: rate limiting (10 req/s per IP on API routes), request buffering, timeout configuration.

---

## Authentication flow

```
Client                api-gateway          auth-service           Postgres
  │                       │                     │                     │
  │─ POST /api/v1/auth/login ──────────────────▶│                     │
  │                       │                     │─ SELECT user ──────▶│
  │                       │                     │◀─ user row ─────────│
  │                       │                     │─ bcrypt.compare()   │
  │                       │                     │─ INSERT refresh_token▶│
  │◀── 200 {accessToken, refreshToken, user} ───│                     │
  │                       │                     │                     │
  │─ GET /api/v1/accounts/customer/:id ─────────│                     │
  │   Authorization: Bearer <accessToken>        │                     │
  │                       │─ forward + header ──▶ account-service     │
  │                       │                     │  (verifies JWT locally)
  │◀── 200 {accounts} ────│                     │                     │
```

---

## Observability

Every service exposes three endpoints on its own port:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness: `{status, service, version, db}` |
| `GET /health/ready` | Readiness: `{status: "ready"}` |
| `GET /metrics` | Prometheus text format |

Prometheus scrapes all four services plus node-exporter and postgres-exporter. Grafana at `localhost:3010` (admin / neobank_grafana) provides dashboards.
