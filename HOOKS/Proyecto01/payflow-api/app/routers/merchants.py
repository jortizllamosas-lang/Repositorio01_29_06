"""Router para el CRUD de merchants."""

from fastapi import APIRouter, Depends

import aiosqlite

from app.database import get_db
from app.models import MerchantCreate, MerchantResponse
from app.services import merchant_service

router = APIRouter(prefix="/merchants", tags=["Merchants"])


@router.post("", response_model=MerchantResponse, status_code=201)
async def create_merchant(
    data: MerchantCreate,
    db: aiosqlite.Connection = Depends(get_db),
) -> MerchantResponse:
    """Crea un nuevo merchant y devuelve su API key."""
    return await merchant_service.create_merchant(db, data)


@router.get("", response_model=list[MerchantResponse])
async def list_merchants(
    db: aiosqlite.Connection = Depends(get_db),
) -> list[MerchantResponse]:
    """Devuelve la lista de todos los merchants."""
    return await merchant_service.list_merchants(db)


@router.get("/{merchant_id}", response_model=MerchantResponse)
async def get_merchant(
    merchant_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> MerchantResponse:
    """Devuelve el detalle de un merchant por su ID."""
    return await merchant_service.get_merchant(db, merchant_id)
