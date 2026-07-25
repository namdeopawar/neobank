# NeoBank API Reference

All endpoints are accessed through the API gateway at `http://localhost:8080`. In K8s, replace the host with your ingress URL.

**Base path:** `/api/v1`  
**Content-Type:** `application/json`  
**Auth:** `Authorization: Bearer <accessToken>` on all protected endpoints

---

## Auth Service (`/api/v1/auth`)

### Register

```
POST /api/v1/auth/register
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "Test@1234!",
  "firstName": "Jane",
  "lastName": "Doe"
}
```
Password rules: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char.

**Response 201:**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "role": "customer",
    "kycVerified": false,
    "createdAt": "2026-07-25T00:00:00Z"
  }
}
```

**Errors:** `422` validation failure, `409` email already exists

---

### Login

```
POST /api/v1/auth/login
```

**Request:**
```json
{ "email": "user@example.com", "password": "Test@1234!" }
```

**Response 200:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "550e8400-e29b-...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "customer",
    "kycVerified": false,
    "lastLogin": "2026-07-25T00:00:00Z"
  }
}
```

**Errors:** `401` invalid credentials, `423` account locked (5 failed attempts → 15-min lock)

---

### Refresh access token

```
POST /api/v1/auth/refresh
```

**Request:**
```json
{ "refreshToken": "550e8400-e29b-..." }
```

**Response 200:**
```json
{ "accessToken": "eyJ..." }
```

**Errors:** `401` invalid/expired/revoked refresh token

---

### Logout

```
POST /api/v1/auth/logout
Authorization: Bearer <accessToken>
```

**Request:**
```json
{ "refreshToken": "550e8400-e29b-..." }
```

Revokes the refresh token in the database. **Response 200.**

---

### Get current user

```
GET /api/v1/auth/me
Authorization: Bearer <accessToken>
```

**Response 200:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "role": "customer",
  "kycVerified": false,
  "lastLogin": "2026-07-25T00:00:00Z"
}
```

---

## Account Service (`/api/v1/accounts`)

### Create account

```
POST /api/v1/accounts
Authorization: Bearer <accessToken>
```

**Request:**
```json
{
  "customerId": "uuid",
  "accountType": "checking",
  "currency": "USD"
}
```
`accountType`: `checking` or `savings`. Savings accounts automatically receive `interestRate: 0.0425` (4.25% APY).

**Response 201:**
```json
{
  "id": "uuid",
  "accountNumber": "ACC-1234567890",
  "customerId": "uuid",
  "accountType": "checking",
  "currency": "USD",
  "balance": "0.0000",
  "availableBalance": "0.0000",
  "holdAmount": "0.0000",
  "interestRate": "0.0000",
  "status": "active",
  "createdAt": "2026-07-25T00:00:00Z"
}
```

---

### Get accounts for a customer

```
GET /api/v1/accounts/customer/:customerId
Authorization: Bearer <accessToken>
```

**Response 200:**
```json
{
  "accounts": [
    { "id": "uuid", "accountNumber": "ACC-...", "accountType": "checking", "balance": "5000.0000", ... },
    { "id": "uuid", "accountNumber": "ACC-...", "accountType": "savings",  "balance": "0.0000", "interestRate": "0.0425", ... }
  ]
}
```

---

### Get account balance

```
GET /api/v1/accounts/:accountId/balance
Authorization: Bearer <accessToken>
```

**Response 200:**
```json
{
  "balance": "5000.0000",
  "availableBalance": "4500.0000",
  "holdAmount": "500.0000",
  "currency": "USD"
}
```

`availableBalance = balance - holdAmount`. Holds are placed for pending transactions.

---

## Transaction Service (`/api/v1/transactions`)

### Create a transaction (deposit or withdrawal)

```
POST /api/v1/transactions
Authorization: Bearer <accessToken>
```

**Request:**
```json
{
  "accountId": "uuid",
  "transactionType": "deposit",
  "amount": 5000,
  "currency": "USD",
  "description": "Initial deposit",
  "initiatedBy": "uuid"
}
```
`transactionType`: `deposit` or `withdrawal`.

**Response 201:**
```json
{
  "reference_id": "TXN7k3mN9pQrStUv",
  "account_id": "uuid",
  "transaction_type": "deposit",
  "amount": "5000.0000",
  "currency": "USD",
  "balance_before": "0.0000",
  "balance_after": "5000.0000",
  "status": "completed",
  "description": "Initial deposit",
  "created_at": "2026-07-25T00:00:00Z"
}
```

---

### Transfer between accounts

```
POST /api/v1/transactions/transfer
Authorization: Bearer <accessToken>
```

**Request:**
```json
{
  "fromAccountId": "uuid",
  "toAccountId": "uuid",
  "amount": 1000,
  "currency": "USD",
  "description": "Rent payment",
  "initiatedBy": "uuid"
}
```

**Fee:** 0.1% of amount. A $1,000 transfer incurs a $1.00 fee, deducted from the source account.

**Response 201:**
```json
{
  "reference": "TXNab12cd34ef56gh",
  "debit_ref": "TXNab12cd34ef56gh-DR",
  "credit_ref": "TXNab12cd34ef56gh-CR",
  "amount": "1000.0000",
  "fee": "1.0000",
  "currency": "USD",
  "status": "completed"
}
```

Three DB rows are created: debit (`-DR`), credit (`-CR`), and fee (`-FEE`).

---

### Get transaction history

```
GET /api/v1/transactions/account/:accountId?page=1&limit=20
Authorization: Bearer <accessToken>
```

**Response 200:**
```json
{
  "transactions": [
    {
      "reference_id": "TXN...",
      "transaction_type": "deposit",
      "amount": "5000.0000",
      "balance_after": "5000.0000",
      "status": "completed",
      "description": "Initial deposit",
      "created_at": "2026-07-25T00:00:00Z"
    }
  ],
  "total": 3,
  "page": 1,
  "pages": 1
}
```

---

## Notification Service (`/api/v1/notifications`)

### Queue a transaction notification

```
POST /api/v1/notifications/transaction
Authorization: Bearer <accessToken>
```

**Request:**
```json
{
  "userId": "uuid",
  "transactionType": "deposit",
  "amount": 5000,
  "currency": "USD",
  "reference": "TXN...",
  "channel": "email"
}
```
`channel`: `email`, `sms`, or `push`. In local dev all channels are stubbed (logged, not sent).

**Response 202:**
```json
{ "message": "Notification queued", "reference_id": "uuid" }
```

---

## Health endpoints (all services)

Each service exposes these on its **own port** (not through the gateway):

```
GET /health
```
```json
{ "status": "healthy", "service": "auth-service", "version": "1.0.0", "db": "connected" }
```

```
GET /health/ready
```
```json
{ "status": "ready" }
```

```
GET /metrics
```
Prometheus text format. Includes standard Go/Node/Python runtime metrics plus custom request counters.

---

## End-to-end test script

Copy-paste into your terminal after starting the stack:

```bash
# Register
curl -s -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@neobank.com","password":"Dev@1234!","firstName":"Dev","lastName":"User"}'

# Login — capture token and user ID
LOGIN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@neobank.com","password":"Dev@1234!"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
USER_ID=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")

# Create checking account
ACCT=$(curl -s -X POST http://localhost:8080/api/v1/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"customerId\":\"$USER_ID\",\"accountType\":\"checking\",\"currency\":\"USD\"}")
ACCT_ID=$(echo "$ACCT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Deposit $5,000
curl -s -X POST http://localhost:8080/api/v1/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"accountId\":\"$ACCT_ID\",\"transactionType\":\"deposit\",\"amount\":5000,\"currency\":\"USD\",\"description\":\"Initial deposit\",\"initiatedBy\":\"$USER_ID\"}"

# Check balance
curl -s http://localhost:8080/api/v1/accounts/$ACCT_ID/balance \
  -H "Authorization: Bearer $TOKEN"

# Get transactions
curl -s "http://localhost:8080/api/v1/transactions/account/$ACCT_ID" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
