import logging
import time
import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core.config import settings
from app.models.schemas import (
    DiseaseDetectionRequest,
    DiseaseDetectionResponse,
    HealthCheckResponse,
    LLMProvider,
)
from app.services.image import sniff_mime
from app.services.llm_vision import llm_vision_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["disease-detection"])

# Simple in-memory rate limiter (per-process). For multi-replica prod, use Redis.
_request_timestamps: list[float] = []


def _check_rate_limit() -> None:
    now = time.time()
    window = 60.0
    while _request_timestamps and _request_timestamps[0] < now - window:
        _request_timestamps.pop(0)
    if len(_request_timestamps) >= settings.rate_limit_per_minute:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again in a minute.")
    _request_timestamps.append(now)


def validate_image_upload(file: UploadFile, content: bytes) -> None:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")
    if len(content) > settings.max_file_size:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content)} bytes). Max is {settings.max_file_size_mb}MB.",
        )
    extension = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if extension not in settings.allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type .{extension or '?'} not allowed. Use: {', '.join(settings.allowed_extensions)}",
        )
    # Prefer Pillow verification downstream; do a cheap MIME sniff here.
    # Try libmagic if available, otherwise fall back to header sniffing so
    # Windows dev machines without libmagic still work.
    mime_type: str | None = None
    try:
        import magic  # type: ignore

        mime_type = magic.Magic(mime=True).from_buffer(content[:4096])
    except Exception:  # noqa: BLE001
        mime_type = sniff_mime(content)
    allowed_mimes = {"image/jpeg", "image/png", "image/webp"}
    if mime_type not in allowed_mimes:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image content detected ({mime_type}). Upload JPEG, PNG, or WebP.",
        )


@router.post("/detect", response_model=DiseaseDetectionResponse)
async def detect_disease(
    file: Annotated[UploadFile, File()],
    provider: Annotated[LLMProvider, Form()] = LLMProvider.openai,
    include_treatment: Annotated[bool, Form()] = True,
    include_prevention: Annotated[bool, Form()] = True,
):
    _check_rate_limit()
    content = await file.read()
    validate_image_upload(file, content)

    request = DiseaseDetectionRequest(
        provider=provider,
        include_treatment=include_treatment,
        include_prevention=include_prevention,
    )
    if provider.value not in llm_vision_service.get_available_providers():
        raise HTTPException(
            status_code=503,
            detail=f"{provider.value} is not configured. Set its API key on the backend.",
        )

    result = await llm_vision_service.detect_disease(content, request)
    if result.success and not result.detection_id:
        result.detection_id = f"det_{uuid.uuid4().hex[:12]}"
    if not result.success:
        logger.warning("detection failed provider=%s err=%s", provider, result.error)
        if result.error and result.error.startswith("File is not a valid image:"):
            raise HTTPException(status_code=400, detail=result.error)
        raise HTTPException(
            status_code=502,
            detail="The AI provider could not complete image analysis. Check backend logs and try again.",
        )
    return result


@router.get("/health", response_model=HealthCheckResponse)
async def health_check():
    return HealthCheckResponse(
        status="healthy",
        version=settings.app_version,
        providers_available=llm_vision_service.get_available_providers(),
    )


@router.get("/providers")
async def get_providers():
    providers = llm_vision_service.get_available_providers()
    return {
        "providers": providers,
        "default": settings.default_llm_provider,
    }


@router.get("/version")
async def get_version():
    return {"name": settings.app_name, "version": settings.app_version}
