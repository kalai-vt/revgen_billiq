from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CustomerCanonicalField = Literal["name", "mobile", "email", "address"]
ImportRowStatus = Literal["ready", "warning", "error"]


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1)
    mobile: str | None = None
    email: str | None = None
    address: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    mobile: str | None = None
    email: str | None = None
    address: str | None = None
    is_active: bool | None = None


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    name: str
    mobile: str | None = None
    email: str | None = None
    address: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CustomerListOut(BaseModel):
    items: list[CustomerOut]
    total: int
    page: int
    page_size: int


class CustomerImportUploadResponse(BaseModel):
    import_id: str
    file_name: str
    source_type: str
    status: str
    rows_total: int
    detected_headers: list[str]
    auto_mapping: dict[CustomerCanonicalField, str | None]
    requires_mapping: bool


class CustomerColumnMappingRequest(BaseModel):
    mapping: dict[CustomerCanonicalField, str | None]


class CustomerImportRowOut(BaseModel):
    id: str
    row_number: int
    matched_customer_id: str | None = None
    name: str | None = None
    mobile: str | None = None
    email: str | None = None
    address: str | None = None
    status: ImportRowStatus
    error_messages: list[str] = []
    is_skipped: bool


class CustomerImportRowListOut(BaseModel):
    import_id: str
    status: str
    items: list[CustomerImportRowOut]
    total: int
    ready_count: int
    warning_count: int
    error_count: int
    skipped_count: int


class CustomerImportRowUpdateRequest(BaseModel):
    name: str | None = None
    mobile: str | None = None
    email: str | None = None
    address: str | None = None
    is_skipped: bool | None = None


class CustomerImportConfirmResponse(BaseModel):
    import_id: str
    status: str
    rows_imported: int
    rows_failed: int
    rows_skipped: int


class CustomerImportHistoryOut(BaseModel):
    id: str
    file_name: str
    source_type: str
    status: str
    rows_total: int
    rows_imported: int
    rows_failed: int
    imported_by: str
    imported_by_name: str
    created_at: datetime
    completed_at: datetime | None = None


class CustomerImportHistoryListOut(BaseModel):
    items: list[CustomerImportHistoryOut]
    total: int
    page: int
    page_size: int
