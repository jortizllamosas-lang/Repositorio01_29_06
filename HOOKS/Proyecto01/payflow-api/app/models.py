"""Modelos Pydantic para requests y responses de la API."""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, field_validator


# ---------------------------------------------------------------------------
# Merchants
# ---------------------------------------------------------------------------

class MerchantCreate(BaseModel):
    """Datos necesarios para crear un nuevo merchant."""
    name: str
    email: EmailStr


class MerchantResponse(BaseModel):
    """Representación completa de un merchant en las respuestas."""
    id: str
    name: str
    email: str
    api_key: str
    status: Literal["active", "suspended"]
    created_at: datetime


# ---------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------

PaymentStatus = Literal["pending", "completed", "failed", "refunded"]

VALID_TRANSITIONS: dict[str, list[str]] = {
    "pending":   ["completed", "failed"],
    "completed": ["refunded"],
    "failed":    [],
    "refunded":  [],
}


class PaymentCreate(BaseModel):
    """Datos necesarios para crear un nuevo pago."""
    amount: float
    currency: str = "EUR"
    description: Optional[str] = None
    customer_email: Optional[EmailStr] = None

    @field_validator("amount")
    @classmethod
    def amount_must_be_positive(cls, v: float) -> float:
        """Valida que el importe sea positivo."""
        if v <= 0:
            raise ValueError("El importe debe ser mayor que cero")
        return v

    @field_validator("currency")
    @classmethod
    def currency_uppercase(cls, v: str) -> str:
        """Normaliza la moneda a mayúsculas."""
        return v.upper()


class PaymentStatusUpdate(BaseModel):
    """Payload para actualizar el estado de un pago."""
    status: PaymentStatus


class PaymentResponse(BaseModel):
    """Representación completa de un pago en las respuestas."""
    id: str
    merchant_id: str
    amount: float
    currency: str
    status: PaymentStatus
    description: Optional[str]
    customer_email: Optional[str]
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    """Respuesta del endpoint de health check."""
    status: str
    version: str
    timestamp: datetime
