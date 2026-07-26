from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

AdminRole = Literal["super_admin", "operations", "support", "finance", "sales", "developer", "auditor"]


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminRefreshRequest(BaseModel):
    refresh_token: str


class AdminLogoutRequest(BaseModel):
    refresh_token: str


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    first_name: str
    last_name: str
    email: str
    role: AdminRole
    status: str
    last_login: datetime | None = None
    created_at: datetime


class AdminAuthResult(BaseModel):
    access_token: str
    refresh_token: str
    admin_user: AdminUserOut
