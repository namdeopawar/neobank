from enum import Enum
from typing import Optional
from pydantic import BaseModel, EmailStr


class NotificationType(str, Enum):
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"
    IN_APP = "in_app"


class NotificationPriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class EmailNotification(BaseModel):
    to: str
    subject: str
    template: str
    context: dict = {}
    priority: NotificationPriority = NotificationPriority.NORMAL


class SMSNotification(BaseModel):
    to: str
    message: str
    priority: NotificationPriority = NotificationPriority.NORMAL


class PushNotification(BaseModel):
    user_id: str
    title: str
    body: str
    data: dict = {}


class TransactionNotification(BaseModel):
    user_id: str
    email: str
    phone: Optional[str] = None
    transaction_type: str
    amount: float
    currency: str = "USD"
    account_number: str
    reference_id: str
    timestamp: str
