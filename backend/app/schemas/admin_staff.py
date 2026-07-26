from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class AdminStaffOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    first_name: str
    last_name: str
    email: str
    role: str
    status: str
    is_active: bool
    must_change_password: bool
    last_login: datetime | None
    created_at: datetime


class AdminStaffInviteRequest(BaseModel):
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    email: str
    role: str


class AdminStaffRoleUpdateRequest(BaseModel):
    role: str


class AcceptInviteRequest(BaseModel):
    token: str
    password: str = Field(min_length=10)


class ChangeOwnPasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10)
