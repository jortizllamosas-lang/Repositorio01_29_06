"""Gestión de la conexión a SQLite y creación de tablas."""

import aiosqlite
from contextlib import asynccontextmanager
from typing import AsyncGenerator

DATABASE_URL = "payflow.db"


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    """Proporciona una conexión a la base de datos como dependencia de FastAPI."""
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        yield db


async def create_tables() -> None:
    """Crea las tablas de la base de datos si no existen."""
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("""
            CREATE TABLE IF NOT EXISTS merchants (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                email       TEXT NOT NULL UNIQUE,
                api_key     TEXT NOT NULL UNIQUE,
                status      TEXT NOT NULL DEFAULT 'active',
                created_at  TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS payments (
                id              TEXT PRIMARY KEY,
                merchant_id     TEXT NOT NULL REFERENCES merchants(id),
                amount          REAL NOT NULL,
                currency        TEXT NOT NULL DEFAULT 'EUR',
                status          TEXT NOT NULL DEFAULT 'pending',
                description     TEXT,
                customer_email  TEXT,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL
            )
        """)
        await db.commit()
