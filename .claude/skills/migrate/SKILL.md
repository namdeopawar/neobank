---
description: Run database migrations for NeoBank services
---

# NeoBank Database Migrations

## Auth Service (Node.js)

The auth service has explicit migration scripts. Run manually — it does NOT auto-migrate on startup.

```bash
# Run on first boot or after DB wipe
docker exec neobank-auth node dist/db/migrate.js

# Check what was created
docker exec neobank-postgres-auth psql -U neobank -d neobank_auth -c "\dt"
# Expected tables: users, refresh_tokens, audit_logs
```

## Account Service (Go)

Account service auto-runs inline migrations at startup using `repository.RunMigrations(db)`.
To verify:
```bash
docker exec neobank-postgres-accounts psql -U neobank -d neobank_accounts -c "\dt"
# Expected: accounts, account_audit
```

## Transaction Service (Python/SQLAlchemy)

Auto-runs `Base.metadata.create_all(checkfirst=True)` on startup via FastAPI lifespan.
To verify:
```bash
docker exec neobank-postgres-transactions psql -U neobank -d neobank_transactions -c "\dt"
# Expected: transactions
```

## Wipe and re-run from scratch

```bash
# Stop services and remove volumes
docker compose down -v

# Restart infra
docker compose up -d postgres-auth postgres-accounts postgres-transactions redis

# Restart app services
docker compose up -d auth-service account-service transaction-service notification-service

# Run auth migrations manually
sleep 15
docker exec neobank-auth node dist/db/migrate.js
```

## Direct DB access

```bash
# Auth DB
docker exec -it neobank-postgres-auth psql -U neobank -d neobank_auth

# Accounts DB
docker exec -it neobank-postgres-accounts psql -U neobank -d neobank_accounts

# Transactions DB
docker exec -it neobank-postgres-transactions psql -U neobank -d neobank_transactions

# Redis CLI
docker exec -it neobank-redis redis-cli -a neobank_redis_secret
```

## Adding a new migration to auth-service

Edit `services/auth-service/src/db/migrate.ts` and add SQL to the `migrations` constant. The script wraps everything in a single transaction with rollback on failure.
