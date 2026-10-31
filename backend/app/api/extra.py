"""Secondary endpoints: disease library and feedback loop stub."""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, HTTPException, Request

from app.core.config import settings
from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    FeedbackRequest,
    FeedbackResponse,
    LLMProvider,
)
from app.services.feedback_store import append_feedback
from app.services.library import get_library
from app.services.llm_vision import llm_vision_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["library-feedback"])
_chat_request_timestamps: dict[str, list[float]] = {}


def _check_chat_rate_limit(client_host: str) -> None:
    now = time.monotonic()
    cutoff = now - 60
    timestamps = [stamp for stamp in _chat_request_timestamps.get(client_host, []) if stamp > cutoff]
    if len(timestamps) >= settings.chat_rate_limit_per_minute:
        raise HTTPException(status_code=429, detail="Chat rate limit exceeded. Try again in a minute.")

    if client_host not in _chat_request_timestamps and len(_chat_request_timestamps) >= 1024:
        for host, stamps in list(_chat_request_timestamps.items()):
            recent = [stamp for stamp in stamps if stamp > cutoff]
            if recent:
                _chat_request_timestamps[host] = recent
            else:
                del _chat_request_timestamps[host]
        if len(_chat_request_timestamps) >= 1024:
            raise HTTPException(status_code=503, detail="Chat capacity is temporarily limited.")

    timestamps.append(now)
    _chat_request_timestamps[client_host] = timestamps


@router.get("/diseases")
async def list_diseases():
    return {"count": len(get_library()), "diseases": [d.model_dump() for d in get_library()]}


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, request: Request):
    _check_chat_rate_limit(request.client.host if request.client else "unknown")
    available = llm_vision_service.get_available_providers()
    if not available:
        raise HTTPException(
            status_code=503,
            detail="Agricultural chat is unavailable until OPENAI_API_KEY or ANTHROPIC_API_KEY is configured.",
        )

    provider = payload.provider
    if provider is None:
        configured_default = settings.default_llm_provider.lower()
        selected = configured_default if configured_default in available else available[0]
        provider = LLMProvider(selected)
    if provider.value not in available:
        raise HTTPException(
            status_code=503,
            detail=f"{provider.value} is not configured. Configure its API key or choose another provider.",
        )

    try:
        answer = await llm_vision_service.ask_agriculture(
            payload.messages, payload.language, provider
        )
    except Exception as exc:
        logger.exception("agricultural chat request failed provider=%s", provider.value)
        raise HTTPException(
            status_code=502,
            detail="The AI provider could not complete the request. Check the backend logs and try again.",
        ) from exc
    return ChatResponse(answer=answer, provider=provider)


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(payload: FeedbackRequest):
    logger.info(
        "feedback rating=%s detection=%s provider=%s comment_len=%s",
        payload.rating, payload.detection_id, payload.provider,
        len(payload.comment or ""),
    )
    try:
        append_feedback(payload.model_dump())
    except OSError as exc:
        logger.exception("feedback could not be persisted")
        raise HTTPException(
            status_code=500,
            detail="Feedback could not be saved. Please try again later.",
        ) from exc
    return FeedbackResponse(success=True, message="Thanks — feedback recorded for review.")
