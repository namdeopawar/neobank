import os
from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "transaction-service",
        "version": os.getenv("APP_VERSION", "1.0.0"),
    }

@router.get("/health/ready")
async def ready():
    return {"status": "ready"}
