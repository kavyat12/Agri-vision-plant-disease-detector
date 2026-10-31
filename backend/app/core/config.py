
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


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

    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    rate_limit_per_minute: int = 60
    chat_rate_limit_per_minute: int = 10
    auth_rate_limit_per_minute: int = 20

    @property
    def max_file_size(self) -> int:
        return self.max_file_size_mb * 1024 * 1024


settings = Settings()
