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
    is_credit_enabled: bool = False
    credit_limit: float | None = Field(default=None, ge=0)
    credit_days: int | None = Field(default=None, ge=0)
    allow_credit_beyond_limit: bool = False
    require_manager_approval: bool = False
    auto_block_credit: bool = False


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    mobile: str | None = None
    email: str | None = None
    address: str | None = None
    is_active: bool | None = None
    is_credit_enabled: bool | None = None
    credit_limit: float | None = Field(default=None, ge=0)
    credit_days: int | None = Field(default=None, ge=0)
    allow_credit_beyond_limit: bool | None = None
    require_manager_approval: bool | None = None
    auto_block_credit: bool | None = None


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    name: str
    mobile: str | None = None
    email: str | None = None
    address: str | None = None
    is_active: bool
    is_credit_enabled: bool = False
    credit_limit: float | None = None
    credit_days: int | None = None
    allow_credit_beyond_limit: bool = False
    require_manager_approval: bool = False
    auto_block_credit: bool = False
    outstanding_amount: float = 0.0
    overdue_amount: float = 0.0
    due_invoices_count: int = 0
    overdue_invoices_count: int = 0
    last_payment_date: datetime | None = None
    created_at: datetime
    updated_at: datetime


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
