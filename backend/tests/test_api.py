import io
import sqlite3

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api.auth import _auth_attempts
from app.api.extra import _chat_request_timestamps
from app.core.config import Settings, settings
from app.main import app
from app.models.schemas import DiseaseDetectionRequest, DiseaseDetectionResponse, LLMProvider
from app.services.llm_vision import _coerce_disease, llm_vision_service

client = TestClient(app)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("https://one.example, https://two.example", ["https://one.example", "https://two.example"]),
        ('["https://one.example"]', ["https://one.example"]),
    ],
)
def test_cors_origins_accept_csv_and_json(value, expected, monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", value)
    assert Settings(_env_file=None).cors_origins == expected


def _leaf_bytes(fmt: str = "JPEG", size=(320, 240), color=(74, 160, 90)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format=fmt)
    return buf.getvalue()


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "AgriVision"
    assert "health" in body


def test_health_check():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "healthy"
    assert "providers_available" in data
    assert "demo_mode" not in data


def test_get_providers():
    r = client.get("/api/v1/providers")
    assert r.status_code == 200
    body = r.json()
    assert "providers" in body
    assert "demo_available" not in body


def test_version():
    r = client.get("/api/v1/version")
    assert r.status_code == 200
    assert r.json()["version"]


def test_diseases_library():
    r = client.get("/api/v1/diseases")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 8
    names = [d["name"] for d in body["diseases"]]
    assert "Early Blight" in names


def test_feedback_accepts_valid():
    r = client.post("/api/v1/feedback", json={"rating": 5, "comment": "Great demo"})
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_feedback_rejects_bad_rating():
    r = client.post("/api/v1/feedback", json={"rating": 9})
    assert r.status_code == 422


def test_detect_invalid_file():
    r = client.post(
        "/api/v1/detect",
        files={"file": ("test.txt", b"not an image", "text/plain")},
    )
    assert r.status_code == 400


def test_detect_empty_file():
    r = client.post(
        "/api/v1/detect",
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )
    assert r.status_code in (400, 413)


def test_detect_without_configured_provider_returns_service_unavailable(monkeypatch):
    monkeypatch.setattr(llm_vision_service, "get_available_providers", list)
    img = _leaf_bytes()
    r = client.post(
        "/api/v1/detect",
        files={"file": ("leaf.jpg", img, "image/jpeg")},
        data={"provider": "openai", "include_treatment": "true", "include_prevention": "true"},
    )
    assert r.status_code == 503, r.text
    assert "not configured" in r.json()["detail"]


def test_provider_confidence_is_not_presented_as_calibrated_model_confidence():
    disease = _coerce_disease(
        {
            "name": "Possible leaf spot",
            "description": "Visible spots require expert confirmation.",
            "severity": "moderate",
            "affected_area": "Leaf surface",
            "symptoms": ["Brown spots"],
            "confidence": 0.99,
        },
        DiseaseDetectionRequest(),
    )
    assert disease.confidence is None


def test_incomplete_provider_result_is_rejected():
    with pytest.raises(ValueError, match="incomplete diagnosis"):
        _coerce_disease({"name": "Unknown"}, DiseaseDetectionRequest())


def test_provider_failure_returns_gateway_error(monkeypatch):
    monkeypatch.setattr(llm_vision_service, "get_available_providers", lambda: ["openai"])

    async def fail_detection(_image, _request):
        return DiseaseDetectionResponse(
            success=False,
            error="provider unavailable",
            processing_time_ms=12,
            provider="openai",
        )

    monkeypatch.setattr(llm_vision_service, "detect_disease", fail_detection)
    response = client.post(
        "/api/v1/detect",
        files={"file": ("leaf.jpg", _leaf_bytes(), "image/jpeg")},
        data={"provider": "openai"},
    )
    assert response.status_code == 502
    assert "could not complete" in response.json()["detail"]


def test_feedback_storage_error_is_not_reported_as_success(monkeypatch):
    def fail(_payload):
        raise OSError("read-only storage")

    monkeypatch.setattr("app.api.extra.append_feedback", fail)
    response = client.post("/api/v1/feedback", json={"rating": 5})
    assert response.status_code == 500
    assert response.json()["detail"] == "Feedback could not be saved. Please try again later."


def _register(email: str):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Secure-test-password-23",
            "full_name": "Test Farmer",
        },
    )


def test_registration_login_and_session_revocation(tmp_path, monkeypatch):
    database_path = tmp_path / "accounts.sqlite3"
    monkeypatch.setattr(settings, "database_path", str(database_path))

    registered = _register("Farmer@example.test")
    assert registered.status_code == 201, registered.text
    data = registered.json()
    token = data["access_token"]
    assert data["user"]["email"] == "farmer@example.test"
    assert client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    ).status_code == 200

    with sqlite3.connect(database_path) as connection:
        password_hash = connection.execute(
            "SELECT password_hash FROM users WHERE email = ?",
            ("farmer@example.test",),
        ).fetchone()[0]
        token_hash = connection.execute("SELECT token_hash FROM sessions").fetchone()[0]
        migration_version = connection.execute(
            "SELECT MAX(version) FROM schema_migrations"
        ).fetchone()[0]
    assert password_hash != "Secure-test-password-23"
    assert ":" in password_hash
    assert token not in token_hash
    assert migration_version == 1

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "FARMER@example.test", "password": "Secure-test-password-23"},
    )
    assert login_response.status_code == 200
    login_token = login_response.json()["access_token"]
    logout_response = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {login_token}"},
    )
    assert logout_response.status_code == 200
    assert client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {login_token}"}
    ).status_code == 401


def test_registration_validation_and_duplicate_email(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "accounts.sqlite3"))
    assert client.post(
        "/api/v1/auth/register",
        json={"email": "bad", "password": "short", "full_name": " "},
    ).status_code == 422
    assert _register("farmer@example.test").status_code == 201
    duplicate = _register("FARMER@example.test")
    assert duplicate.status_code == 409


def test_crop_crud_is_scoped_to_authenticated_user(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "farm.sqlite3"))
    first = _register("first@example.test").json()["access_token"]
    second = _register("second@example.test").json()["access_token"]
    first_headers = {"Authorization": f"Bearer {first}"}
    second_headers = {"Authorization": f"Bearer {second}"}

    assert client.get("/api/v1/crops").status_code == 401
    created = client.post(
        "/api/v1/crops",
        headers=first_headers,
        json={
            "name": "Tomato",
            "variety": "Arka",
            "planting_date": "2026-06-01",
            "farm_location": "Mysuru",
            "soil_type": "Loamy",
            "growth_stage": "Flowering",
        },
    )
    assert created.status_code == 201, created.text
    crop_id = created.json()["id"]
    assert [crop["name"] for crop in client.get(
        "/api/v1/crops", headers=first_headers
    ).json()] == ["Tomato"]
    assert client.get("/api/v1/crops", headers=second_headers).json() == []

    changed = client.put(
        f"/api/v1/crops/{crop_id}",
        headers=first_headers,
        json={"name": "Tomato", "growth_stage": "Harvest"},
    )
    assert changed.status_code == 200
    assert changed.json()["growth_stage"] == "Harvest"
    assert client.put(
        f"/api/v1/crops/{crop_id}",
        headers=second_headers,
        json={"name": "Stolen record"},
    ).status_code == 404
    assert client.delete(
        f"/api/v1/crops/{crop_id}", headers=second_headers
    ).status_code == 404
    assert client.delete(
        f"/api/v1/crops/{crop_id}", headers=first_headers
    ).status_code == 200
    assert client.get("/api/v1/crops", headers=first_headers).json() == []


def test_authentication_requests_are_rate_limited(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "limited.sqlite3"))
    monkeypatch.setattr(settings, "auth_rate_limit_per_minute", 1)
    _auth_attempts.clear()
    try:
        assert _register("limited@example.test").status_code == 201
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "limited@example.test", "password": "Secure-test-password-23"},
        )
        assert response.status_code == 429
    finally:
        _auth_attempts.clear()


def test_detect_rejects_oversize_extension():
    r = client.post(
        "/api/v1/detect",
        files={"file": ("leaf.bmp", _leaf_bytes(), "image/bmp")},
    )
    assert r.status_code == 400


def test_chat_uses_configured_provider(monkeypatch):
    async def fake_answer(messages, language, provider):
        assert messages[-1].content == "How do I scout tomato plants?"
        assert language.value == "kn"
        assert provider == LLMProvider.openai
        return "Inspect both leaf surfaces and note the crop stage."

    monkeypatch.setattr(llm_vision_service, "get_available_providers", lambda: ["openai"])
    monkeypatch.setattr(llm_vision_service, "ask_agriculture", fake_answer)
    response = client.post(
        "/api/v1/chat",
        json={
            "language": "kn",
            "messages": [{"role": "user", "content": "How do I scout tomato plants?"}],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json() == {
        "answer": "Inspect both leaf surfaces and note the crop stage.",
        "provider": "openai",
    }


def test_chat_requires_configured_provider(monkeypatch):
    monkeypatch.setattr(llm_vision_service, "get_available_providers", list)
    response = client.post(
        "/api/v1/chat",
        json={"messages": [{"role": "user", "content": "How should I water maize?"}]},
    )
    assert response.status_code == 503
    assert "API_KEY" in response.json()["detail"]


def test_chat_rejects_conversation_ending_with_assistant():
    response = client.post(
        "/api/v1/chat",
        json={
            "messages": [{"role": "assistant", "content": "What crop are you growing?"}],
        },
    )
    assert response.status_code == 422


def test_chat_rate_limit(monkeypatch):
    _chat_request_timestamps.clear()
    monkeypatch.setattr(settings, "chat_rate_limit_per_minute", 1)
    monkeypatch.setattr(llm_vision_service, "get_available_providers", lambda: ["openai"])

    async def fake_answer(messages, language, provider):
        return "Ask a local extension officer if symptoms worsen."

    monkeypatch.setattr(llm_vision_service, "ask_agriculture", fake_answer)
    request_data = {"messages": [{"role": "user", "content": "How do I monitor maize?"}]}
    try:
        assert client.post("/api/v1/chat", json=request_data).status_code == 200
        response = client.post("/api/v1/chat", json=request_data)
        assert response.status_code == 429
    finally:
        _chat_request_timestamps.clear()


def test_security_headers_present():
    r = client.get("/")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
