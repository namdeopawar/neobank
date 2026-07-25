---
description: Start NeoBank locally with Docker Compose and verify all services are healthy
---

# NeoBank Local Run

## Prerequisites check
```bash
docker context use desktop-linux
docker ps > /dev/null 2>&1 || (open -a Docker && sleep 15)
```

## Startup sequence

Always start infrastructure before app services:

```bash
cd /Users/nama/learning/development/neobank

# Step 1: Start databases and cache
docker compose up -d postgres-auth postgres-accounts postgres-transactions redis
```

Wait ~15 seconds for healthchecks, then:

```bash
# Step 2: Start app services
docker compose up -d auth-service account-service transaction-service notification-service
```

Wait ~20 seconds for startup, then:

```bash
# Step 3: Run DB migrations (REQUIRED on first boot and after volume wipe)
docker exec neobank-auth node dist/db/migrate.js
```

Optionally start monitoring:
```bash
docker compose up -d prometheus grafana
```

```bash
# Step 4: Start frontend and api-gateway (for browser UI)
docker compose up -d frontend api-gateway
```

## Access the application

| URL | What it is |
|---|---|
| **http://localhost:8080** | Full app — use this in browser (api-gateway serves frontend + proxies API) |
| http://localhost:3000 | Static SPA only — API calls fail here, use 8080 instead |
| http://localhost:9090 | Prometheus metrics |
| http://localhost:3010 | Grafana dashboards (admin / neobank_grafana) |

IMPORTANT: Always use port 8080, not 3000. The React SPA uses relative /api/v1/... URLs
that only resolve through the api-gateway.

## Verify all services healthy

```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep neobank
```

Expected: all showing `(healthy)` or `Up`.

## Smoke test the full verified flow

All steps below were tested and confirmed working in the initial local run.

```bash
# Health checks
curl -s http://localhost:3001/health | python3 -m json.tool
curl -s http://localhost:3002/health | python3 -m json.tool
curl -s http://localhost:3003/health | python3 -m json.tool
curl -s http://localhost:3004/health | python3 -m json.tool

# Register
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@neobank.com","password":"Test@1234!","firstName":"Test","lastName":"User"}'

# Login and extract token + user ID
LOGIN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@neobank.com","password":"Test@1234!"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
USER_ID=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")

# Create checking account
ACCT=$(curl -s -X POST http://localhost:3002/api/v1/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"customerId\":\"$USER_ID\",\"accountType\":\"checking\",\"currency\":\"USD\"}")
ACCT_ID=$(echo "$ACCT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Create savings account (automatically gets 4.25% APY)
curl -s -X POST http://localhost:3002/api/v1/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"customerId\":\"$USER_ID\",\"accountType\":\"savings\",\"currency\":\"USD\"}"

# Deposit $5000
curl -s -X POST http://localhost:3003/api/v1/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"accountId\":\"$ACCT_ID\",\"transactionType\":\"deposit\",\"amount\":5000,\"currency\":\"USD\",\"description\":\"Initial deposit\",\"initiatedBy\":\"$USER_ID\"}"

# Transfer $1000 (incurs 0.1% fee = $1.00; creates debit TXN...-DR and credit TXN...-CR entries)
curl -s -X POST http://localhost:3003/api/v1/transactions/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"fromAccountId\":\"$ACCT_ID\",\"toAccountId\":\"$ACCT_ID\",\"amount\":1000,\"currency\":\"USD\",\"description\":\"Test transfer\",\"initiatedBy\":\"$USER_ID\"}"

# Get transaction history (paginated)
curl -s "http://localhost:3003/api/v1/transactions/account/$ACCT_ID" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Queue a notification
curl -s -X POST http://localhost:3004/api/v1/notifications/transaction \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"userId":"'"$USER_ID"'","transactionType":"deposit","amount":5000,"currency":"USD","reference":"TXNTEST","channel":"email"}'

# Verify JWT / get profile
curl -s http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Prometheus metrics (pick any service)
curl -s http://localhost:3001/metrics | head -20
```

## Verified working end-to-end

All 14 containers confirmed healthy. Full browser flow tested at http://localhost:8080 (api-gateway + frontend + all backend services). Professional React UI with Inter font, SVG icons, CSS design system — login, register, dashboard, accounts, transactions (deposit + history), transfer (step indicator), profile all functional.

## Service URLs
- Frontend: http://localhost:3000
- API Gateway: http://localhost:8080
- Auth: http://localhost:3001
- Accounts: http://localhost:3002
- Transactions: http://localhost:3003
- Notifications: http://localhost:3004
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3010 (admin/neobank_grafana)

## Stop / Clean

```bash
docker compose down          # Stop, keep volumes
docker compose down -v       # Stop + wipe all data
```

## Known startup issues

| Symptom | Fix |
|---|---|
| `Cannot connect to Docker daemon` | `docker context use desktop-linux` |
| Auth 500 on register | Run migrations: `docker exec neobank-auth node dist/db/migrate.js` |
| Transaction service crash on restart | Already fixed (native_enum=False + checkfirst=True) |
| Port conflict on 3001 | Grafana is on 3010, not 3001 — check docker-compose.yml |
| `docker start neobank-notification-service` fails | Container is named `neobank-notifications` — use `docker compose up -d notification-service` instead |
| account-service shows (unhealthy) | Old issue: FROM scratch + --spider healthcheck. Fixed in Dockerfile (alpine:3.19 + `-O /dev/null`) |
| frontend shows (unhealthy) | `localhost` resolves to IPv6 in nginx:alpine — use `127.0.0.1` in HEALTHCHECK |
| API 404 when on port 3000 | Access via port 8080 (api-gateway) not port 3000 (frontend only) |
