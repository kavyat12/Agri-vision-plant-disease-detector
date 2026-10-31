import re
from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator


class LLMProvider(str, Enum):
    openai = "openai"
    anthropic = "anthropic"


class ChatLanguage(str, Enum):
    en = "en"
    hi = "hi"
    kn = "kn"
    mr = "mr"


class ChatMessageRole(str, Enum):
    user = "user"
    assistant = "assistant"


class ChatMessage(BaseModel):
    role: ChatMessageRole
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)
    language: ChatLanguage = ChatLanguage.en
    provider: LLMProvider | None = None

    @model_validator(mode="after")
    def validate_conversation(self):
        if self.messages[-1].role != ChatMessageRole.user:
            raise ValueError("The latest chat message must be from the user.")
        if sum(len(message.content) for message in self.messages) > 20000:
            raise ValueError("The conversation is too long. Start a new chat.")
        return self


class ChatResponse(BaseModel):
    answer: str
    provider: LLMProvider


class DiseaseSeverity(str, Enum):
    mild = "mild"
    moderate = "moderate"
    severe = "severe"


class DiseaseDetectionRequest(BaseModel):
    provider: LLMProvider = LLMProvider.openai
    include_treatment: bool = True
    include_prevention: bool = True


class DiseaseInfo(BaseModel):
    name: str
    scientific_name: str | None = None
    description: str
    severity: DiseaseSeverity
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    affected_area: str
    symptoms: list[str]
    treatment: str | None = None
    prevention: str | None = None


class DiseaseDetectionResponse(BaseModel):
    success: bool
    disease: DiseaseInfo | None = None
    error: str | None = None
    processing_time_ms: float
    provider: str | None = None
    detection_id: str | None = None


class HealthCheckResponse(BaseModel):
    status: str
    version: str
    providers_available: list[str]


class DiseaseLibraryItem(BaseModel):
    id: str
    name: str
    scientific_name: str | None = None
    severity_hint: DiseaseSeverity = DiseaseSeverity.moderate
    symptoms: list[str]
    prevention: str
    treatment_hint: str


class FeedbackRequest(BaseModel):
    detection_id: str | None = None
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)
    provider: str | None = None


class FeedbackResponse(BaseModel):
    success: bool
    message: str


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=128)
    full_name: str = Field(min_length=1, max_length=120)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
            raise ValueError("Enter a valid email address.")
        return normalized

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Name must not be blank.")
        return normalized


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
            raise ValueError("Enter a valid email address.")
        return normalized


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserResponse


class CropCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    variety: str | None = Field(default=None, max_length=120)
    planting_date: date | None = None
    farm_location: str | None = Field(default=None, max_length=200)
    soil_type: str | None = Field(default=None, max_length=120)
    growth_stage: str | None = Field(default=None, max_length=120)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Crop name must not be blank.")
        return normalized

    @field_validator("variety", "farm_location", "soil_type", "growth_stage")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class CropResponse(CropCreate):
    id: str
    created_at: datetime
    updated_at: datetime
