from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.password_policy import validate_password_strength


class RegisterRequest(BaseModel):
    company_name: str = Field(min_length=2)
    legal_name: str = Field(min_length=2)
    email: str
    phone: str
    phone_type: Literal["mobile", "landline"] = "mobile"
    password: str = Field(min_length=10)
    first_name: str
    last_name: str
    country: str = "IN"
    currency: str = "INR"
    timezone: str = "Asia/Kolkata"

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        return validate_password_strength(value)


class LoginRequest(BaseModel):
    email: str
    password: str
    remember_me: bool = False


class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        return validate_password_strength(value)


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_name: str
    legal_name: str
    email: str
    phone: str
    phone_type: str
    country: str
    timezone: str
    language: str
    created_at: datetime


class TenantUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=2)
    phone: str | None = None
    phone_type: Literal["mobile", "landline"] | None = None
    timezone: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    email: str
    first_name: str
    last_name: str
    mobile: str | None = None
    role: str
    status: str
    is_email_verified: bool
    avatar_url: str | None = None
    created_at: datetime


class UpdateProfileRequest(BaseModel):
    first_name: str | None = Field(default=None, min_length=1)
    last_name: str | None = Field(default=None, min_length=1)
    mobile: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        return validate_password_strength(value)


class LoginHistoryEntryOut(BaseModel):
    event_type: str
    created_at: datetime


class TeamMemberCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    mobile: str | None = None
    password: str = Field(min_length=10)
    role: Literal["manager", "staff"]

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        return validate_password_strength(value)
