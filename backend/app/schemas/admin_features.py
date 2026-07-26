from __future__ import annotations

from pydantic import BaseModel


class FeatureFlagItem(BaseModel):
    module_key: str
    label: str
    enabled: bool
    available: bool


class FeatureFlagUpdateRequest(BaseModel):
    module_key: str
    enabled: bool
