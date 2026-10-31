"""FastAPI application factory with production-ready defaults."""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth import router as auth_router
from app.api.crops import router as crops_router
from app.api.extra import router as extra_router
from app.api.routes import router as api_router
from app.core.config import settings
from app.middleware.request_id import RequestIdMiddleware
from app.services.database import initialize_database


def configure_logging() -> None:
    level = logging.DEBUG if settings.debug else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    initialize_database()
    log = logging.getLogger("plant-detector")
    log.info(
        "startup app=%s version=%s debug=%s cors=%s",
        settings.app_name, settings.app_version, settings.debug, settings.cors_origins,
    )
    yield
    log.info("shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "Plant Disease Detection API. Upload a leaf image for structured "
            "visual assessment using a configured AI provider."
        ),
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def add_security_and_timing(request: Request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logging.getLogger(__name__).exception("unhandled request error")
            return JSONResponse(status_code=500, content={"detail": "Internal server error"})
        elapsed_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-Process-Time-ms"] = f"{elapsed_ms:.1f}"
        if request.method == "GET" and request.url.path.startswith("/api/v1/diseases"):
            response.headers["Cache-Control"] = "public, max-age=3600"
        return response

    app.include_router(api_router)
    app.include_router(extra_router)
    app.include_router(auth_router)
    app.include_router(crops_router)

    @app.get("/", tags=["meta"])
    async def root():
        return {
            "name": settings.app_name,
            "version": settings.app_version,
            "docs": "/docs",
            "health": "/api/v1/health",
            "diseases": "/api/v1/diseases",
        }

    return app


app = create_app()
