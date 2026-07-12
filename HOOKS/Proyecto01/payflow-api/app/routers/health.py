"""Router para el endpoint de health check."""

from datetime import datetime, timezone

from fastapi import APIRouter

from app.models import HealthResponse

router = APIRouter(tags=["Health"])

APP_VERSION = "0.1.0"


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Devuelve el estado de salud de la API."""
    return HealthResponse(
        status="ok",
        version=APP_VERSION,
        timestamp=datetime.now(timezone.utc),
    )
