"""Lógica de negocio para la gestión de merchants."""

import secrets
import uuid
from datetime import datetime, timezone

import aiosqlite
from fastapi import HTTPException

from app.models import MerchantCreate, MerchantResponse


def _row_to_merchant(row: aiosqlite.Row) -> MerchantResponse:
    """Convierte una fila de SQLite en un objeto MerchantResponse."""
    return MerchantResponse(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        api_key=row["api_key"],
        status=row["status"],
        created_at=row["created_at"],
    )


async def create_merchant(db: aiosqlite.Connection, data: MerchantCreate) -> MerchantResponse:
    """Crea un nuevo merchant y le genera una API key única."""
    merchant_id = str(uuid.uuid4())
    api_key = "pk_" + secrets.token_hex(16)
    now = datetime.now(timezone.utc).isoformat()

    try:
        await db.execute(
            """
            INSERT INTO merchants (id, name, email, api_key, status, created_at)
            VALUES (?, ?, ?, ?, 'active', ?)
            """,
            (merchant_id, data.name, data.email, api_key, now),
        )
        await db.commit()
    except aiosqlite.IntegrityError:
        raise HTTPException(status_code=409, detail="Ya existe un merchant con ese email")

    async with db.execute(
        "SELECT * FROM merchants WHERE id = ?", (merchant_id,)
    ) as cursor:
        row = await cursor.fetchone()

    return _row_to_merchant(row)


async def list_merchants(db: aiosqlite.Connection) -> list[MerchantResponse]:
    """Devuelve todos los merchants ordenados por fecha de creación descendente."""
    async with db.execute(
        "SELECT * FROM merchants ORDER BY created_at DESC"
    ) as cursor:
        rows = await cursor.fetchall()
    return [_row_to_merchant(r) for r in rows]


async def get_merchant(db: aiosqlite.Connection, merchant_id: str) -> MerchantResponse:
    """Obtiene un merchant por su ID o lanza 404 si no existe."""
    async with db.execute(
        "SELECT * FROM merchants WHERE id = ?", (merchant_id,)
    ) as cursor:
        row = await cursor.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Merchant no encontrado")

    return _row_to_merchant(row)


async def get_merchant_by_api_key(
    db: aiosqlite.Connection, api_key: str
) -> MerchantResponse:
    """Obtiene un merchant por su API key o lanza 401 si no existe."""
    async with db.execute(
        "SELECT * FROM merchants WHERE api_key = ?", (api_key,)
    ) as cursor:
        row = await cursor.fetchone()

    if row is None:
        raise HTTPException(status_code=401, detail="API key inválida")

    if row["status"] == "suspended":
        raise HTTPException(status_code=403, detail="Merchant suspendido")

    return _row_to_merchant(row)
