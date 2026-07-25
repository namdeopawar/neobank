import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from .database import Base


class TransactionType(str, enum.Enum):
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"
    TRANSFER = "transfer"
    PAYMENT = "payment"
    REFUND = "refund"
    FEE = "fee"
    INTEREST = "interest"


class TransactionStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    REVERSED = "reversed"
    CANCELLED = "cancelled"


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference_id = Column(String(64), unique=True, nullable=False)
    account_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    counterparty_account_id = Column(UUID(as_uuid=True), nullable=True)
    transaction_type = Column(Enum(TransactionType, native_enum=False), nullable=False)
    status = Column(Enum(TransactionStatus, native_enum=False), nullable=False, default=TransactionStatus.PENDING)
    amount = Column(Numeric(20, 4), nullable=False)
    fee = Column(Numeric(20, 4), default=Decimal("0"))
    currency = Column(String(3), nullable=False, default="USD")
    description = Column(Text, nullable=True)
    extra_data = Column("metadata", JSONB, nullable=True)
    initiated_by = Column(UUID(as_uuid=True), nullable=False)
    ip_address = Column(String(45), nullable=True)
    channel = Column(String(20), default="api")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_transactions_account_id", "account_id"),
        Index("idx_transactions_status", "status"),
        Index("idx_transactions_type", "transaction_type"),
        Index("idx_transactions_created_at", "created_at"),
        Index("idx_transactions_reference_id", "reference_id"),
    )
