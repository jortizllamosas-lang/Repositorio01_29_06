"""Punto de entrada de la aplicación FastAPI PayFlow."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import create_tables
from app.routers import health, merchants, payments


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Gestiona el ciclo de vida de la aplicación: crea tablas al arrancar."""
    await create_tables()
    yield


app = FastAPI(
    title="PayFlow API",
    description="API REST de procesamiento de pagos - Proyecto educativo",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS abierto (proyecto educativo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(merchants.router)
app.include_router(payments.router)

# Frontend estático accesible en /dashboard
app.mount("/dashboard", StaticFiles(directory="frontend", html=True), name="dashboard")
