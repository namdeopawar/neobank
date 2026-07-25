import secrets
import string
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Transaction, TransactionStatus, TransactionType
from ..schemas import PaginatedTransactions, TransactionCreate, TransactionResponse, TransferCreate

log = structlog.get_logger()
router = APIRouter()

ACCOUNT_SERVICE_URL = "http://account-service:3002"
FEE_RATES = {
    TransactionType.TRANSFER: Decimal("0.001"),
    TransactionType.WITHDRAWAL: Decimal("0.002"),
    TransactionType.PAYMENT: Decimal("0.005"),
}


def generate_reference() -> str:
    chars = string.ascii_uppercase + string.digits
    return "TXN" + "".join(secrets.choice(chars) for _ in range(13))


def calculate_fee(amount: Decimal, txn_type: TransactionType) -> Decimal:
    rate = FEE_RATES.get(txn_type, Decimal("0"))
    return round(amount * rate, 4)


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    req: TransactionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    reference_id = generate_reference()
    fee = calculate_fee(req.amount, TransactionType(req.transaction_type))
    initiated_by = uuid.uuid4()  # Extract from JWT in production

    txn = Transaction(
        reference_id=reference_id,
        account_id=req.account_id,
        counterparty_account_id=req.counterparty_account_id,
        transaction_type=TransactionType(req.transaction_type),
        status=TransactionStatus.PENDING,
        amount=req.amount,
        fee=fee,
        currency=req.currency,
        description=req.description,
        initiated_by=initiated_by,
        ip_address=request.client.host if request.client else None,
        channel=req.channel or "api",
    )

    db.add(txn)
    await db.flush()

    # Mark as completed (in production: async processing via Kafka)
    txn.status = TransactionStatus.COMPLETED
    txn.completed_at = datetime.now(timezone.utc)

    log.info("Transaction created", reference_id=reference_id, amount=str(req.amount), type=req.transaction_type)
    return txn


@router.post("/transfer", response_model=dict, status_code=status.HTTP_201_CREATED)
async def initiate_transfer(req: TransferCreate, db: AsyncSession = Depends(get_db)):
    if req.from_account_id == req.to_account_id:
        raise HTTPException(400, "Cannot transfer to the same account")

    ref = generate_reference()
    fee = calculate_fee(req.amount, TransactionType.TRANSFER)
    initiated_by = uuid.uuid4()

    debit_txn = Transaction(
        reference_id=f"{ref}-DR",
        account_id=req.from_account_id,
        counterparty_account_id=req.to_account_id,
        transaction_type=TransactionType.TRANSFER,
        status=TransactionStatus.COMPLETED,
        amount=req.amount,
        fee=fee,
        currency=req.currency,
        description=req.description or "Transfer",
        initiated_by=initiated_by,
        completed_at=datetime.now(timezone.utc),
    )

    credit_txn = Transaction(
        reference_id=f"{ref}-CR",
        account_id=req.to_account_id,
        counterparty_account_id=req.from_account_id,
        transaction_type=TransactionType.TRANSFER,
        status=TransactionStatus.COMPLETED,
        amount=req.amount,
        fee=Decimal("0"),
        currency=req.currency,
        description=req.description or "Transfer received",
        initiated_by=initiated_by,
        completed_at=datetime.now(timezone.utc),
    )

    db.add(debit_txn)
    db.add(credit_txn)

    log.info("Transfer initiated", reference=ref, amount=str(req.amount))
    return {"message": "Transfer completed", "reference": ref, "debit_ref": f"{ref}-DR", "credit_ref": f"{ref}-CR"}


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(transaction_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Transaction).where(Transaction.id == transaction_id))
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    return txn


@router.get("/account/{account_id}", response_model=PaginatedTransactions)
async def get_account_transactions(
    account_id: uuid.UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    transaction_type: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Transaction).where(Transaction.account_id == account_id)
    if transaction_type:
        query = query.where(Transaction.transaction_type == transaction_type)
    if status:
        query = query.where(Transaction.status == status)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    query = query.order_by(Transaction.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    transactions = result.scalars().all()

    return PaginatedTransactions(
        transactions=transactions,
        total=total,
        page=page,
        per_page=per_page,
        pages=(total + per_page - 1) // per_page,
    )


@router.get("/reference/{reference_id}", response_model=TransactionResponse)
async def get_by_reference(reference_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Transaction).where(Transaction.reference_id == reference_id))
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    return txn
