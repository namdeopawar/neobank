import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from ..schemas import EmailNotification, SMSNotification, PushNotification, TransactionNotification

log = structlog.get_logger()
router = APIRouter()

TEMPLATES = {
    "transaction_debit": """
    Dear Customer,
    A debit of {currency} {amount} has been made from your account {account_number}.
    Reference: {reference_id}
    If this was not you, contact us immediately at 1-800-NEOBANK.
    """,
    "transaction_credit": """
    Dear Customer,
    A credit of {currency} {amount} has been received in your account {account_number}.
    Reference: {reference_id}
    """,
    "login_alert": """
    A new login was detected on your NeoBank account.
    If this was not you, secure your account immediately.
    """,
    "password_changed": """
    Your NeoBank password has been changed successfully.
    If you did not make this change, contact support immediately.
    """,
}


async def send_email_async(notification: EmailNotification):
    """In production: integrate with SendGrid, SES, or Mailgun"""
    template = TEMPLATES.get(notification.template, "")
    body = template.format(**notification.context) if notification.context else template
    log.info(
        "Email sent",
        to=notification.to,
        subject=notification.subject,
        template=notification.template,
    )


async def send_sms_async(notification: SMSNotification):
    """In production: integrate with Twilio, AWS SNS, or Vonage"""
    log.info("SMS sent", to=notification.to[:6] + "****", message_preview=notification.message[:30])


@router.post("/email", status_code=status.HTTP_202_ACCEPTED)
async def send_email(notification: EmailNotification, background_tasks: BackgroundTasks):
    background_tasks.add_task(send_email_async, notification)
    return {"message": "Email queued", "to": notification.to, "template": notification.template}


@router.post("/sms", status_code=status.HTTP_202_ACCEPTED)
async def send_sms(notification: SMSNotification, background_tasks: BackgroundTasks):
    background_tasks.add_task(send_sms_async, notification)
    return {"message": "SMS queued"}


@router.post("/push", status_code=status.HTTP_202_ACCEPTED)
async def send_push(notification: PushNotification, background_tasks: BackgroundTasks):
    log.info("Push notification queued", user_id=notification.user_id, title=notification.title)
    return {"message": "Push notification queued"}


@router.post("/transaction", status_code=status.HTTP_202_ACCEPTED)
async def send_transaction_notification(notif: TransactionNotification, background_tasks: BackgroundTasks):
    template = "transaction_debit" if notif.transaction_type in ("withdrawal", "transfer") else "transaction_credit"
    email_notif = EmailNotification(
        to=notif.email,
        subject=f"NeoBank: {notif.transaction_type.title()} of {notif.currency} {notif.amount}",
        template=template,
        context={
            "currency": notif.currency,
            "amount": notif.amount,
            "account_number": notif.account_number[-4:].rjust(10, "*"),
            "reference_id": notif.reference_id,
        },
    )
    background_tasks.add_task(send_email_async, email_notif)

    if notif.phone:
        sms_notif = SMSNotification(
            to=notif.phone,
            message=f"NeoBank: {notif.transaction_type.title()} {notif.currency}{notif.amount} on acct **{notif.account_number[-4:]}. Ref: {notif.reference_id}",
        )
        background_tasks.add_task(send_sms_async, sms_notif)

    return {"message": "Transaction notifications queued", "reference_id": notif.reference_id}


@router.get("/templates", response_model=list[str])
async def list_templates():
    return list(TEMPLATES.keys())
