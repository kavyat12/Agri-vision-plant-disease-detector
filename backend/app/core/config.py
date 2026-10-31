
import json
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    app_name: str = "AgriVision"
    api_version: str = "v1"
    app_version: str = "2.1.0"
    debug: bool = False
    database_path: str = str(Path(__file__).resolve().parents[2] / "agrivision.sqlite3")

    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    default_llm_provider: str = "openai"

    max_file_size_mb: int = 10
    allowed_extensions: list[str] = ["jpg", "jpeg", "png", "webp"]

    cors_origins: Annotated[
        list[str],
        NoDecode,
    ] = ["http://localhost:5173", "http://localhost:3000"]
    rate_limit_per_minute: int = 60
    chat_rate_limit_per_minute: int = 10
    auth_rate_limit_per_minute: int = 20

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> list[str]:
        if isinstance(value, str):
            stripped = value.strip()
            value = json.loads(stripped) if stripped.startswith("[") else stripped.split(",")
        if not isinstance(value, list) or not all(isinstance(origin, str) for origin in value):
            raise ValueError("CORS_ORIGINS must be a comma-separated string or JSON list of strings")
        return [origin.strip() for origin in value if origin.strip()]

    @property
    def max_file_size(self) -> int:
        return self.max_file_size_mb * 1024 * 1024


settings = Settings()
