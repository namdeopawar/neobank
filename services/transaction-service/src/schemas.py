import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class TransactionCreate(BaseModel):
    account_id: uuid.UUID
    counterparty_account_id: Optional[uuid.UUID] = None
    transaction_type: str
    amount: Decimal = Field(gt=0, le=Decimal("1000000"))
    currency: str = Field(default="USD", pattern="^[A-Z]{3}$")
    description: Optional[str] = Field(None, max_length=500)
    channel: Optional[str] = "api"

    @field_validator("amount")
    @classmethod
    def amount_precision(cls, v: Decimal) -> Decimal:
        if v != round(v, 4):
            raise ValueError("Amount cannot have more than 4 decimal places")
        return v


class TransferCreate(BaseModel):
    from_account_id: uuid.UUID
    to_account_id: uuid.UUID
    amount: Decimal = Field(gt=0, le=Decimal("100000"))
    currency: str = Field(default="USD", pattern="^[A-Z]{3}$")
    description: Optional[str] = Field(None, max_length=500)
    scheduled_at: Optional[datetime] = None


class TransactionResponse(BaseModel):
    id: uuid.UUID
    reference_id: str
    account_id: uuid.UUID
    counterparty_account_id: Optional[uuid.UUID]
    transaction_type: str
    status: str
    amount: Decimal
    fee: Decimal
    currency: str
    description: Optional[str]
    channel: str
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PaginatedTransactions(BaseModel):
    transactions: list[TransactionResponse]
    total: int
    page: int
    per_page: int
    pages: int
