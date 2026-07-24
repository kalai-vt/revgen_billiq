from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

IdentifierType = Literal["pid", "sku", "barcode", "qr_code", "model_number", "item_code", "custom"]
ProductCanonicalField = Literal[
    "name", "identifier_value", "category", "cost_price", "selling_price", "tax_rate_percent", "barcode"
]
ImportRowStatus = Literal["ready", "warning", "error"]


class IdentifierItem(BaseModel):
    identifier_type: IdentifierType
    identifier_label: str | None = None
    identifier_value: str = Field(min_length=1)


class ProductCreate(BaseModel):
    name: str = Field(min_length=2)
    identifier_type: IdentifierType = "pid"
    identifier_label: str | None = None
    identifier_value: str = Field(min_length=1)
    barcode: str | None = None
    category_id: str | None = None
    description: str | None = None
    cost_price: float = Field(default=0.0, ge=0)
    selling_price: float = Field(default=0.0, ge=0)
    tax_rate_percent: float = Field(default=0.0, ge=0, le=100)
    additional_identifiers: list[IdentifierItem] | None = None


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2)
    identifier_type: IdentifierType | None = None
    identifier_label: str | None = None
    identifier_value: str | None = Field(default=None, min_length=1)
    barcode: str | None = None
    category_id: str | None = None
    description: str | None = None
    cost_price: float | None = Field(default=None, ge=0)
    selling_price: float | None = Field(default=None, ge=0)
    tax_rate_percent: float | None = Field(default=None, ge=0, le=100)
    is_active: bool | None = None
    additional_identifiers: list[IdentifierItem] | None = None


class IdentifierItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    identifier_type: IdentifierType
    identifier_label: str | None = None
    identifier_value: str


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    name: str
    identifier_type: IdentifierType
    identifier_label: str | None = None
    identifier_value: str
    barcode: str | None = None
    category_id: str | None = None
    category_name: str | None = None
    description: str | None = None
    cost_price: float
    selling_price: float
    tax_rate_percent: float
    is_active: bool
    created_at: datetime
    updated_at: datetime
    additional_identifiers: list[IdentifierItemOut] = []


class ProductMatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    identifier_value: str


class DuplicateCheckOut(BaseModel):
    name_match: ProductMatchOut | None = None
    identifier_match: ProductMatchOut | None = None
    barcode_match: ProductMatchOut | None = None


class ProductImportUploadResponse(BaseModel):
    import_id: str
    file_name: str
    source_type: str
    status: str
    rows_total: int
    detected_headers: list[str]
    auto_mapping: dict[ProductCanonicalField, str | None]
    requires_mapping: bool


class ProductColumnMappingRequest(BaseModel):
    mapping: dict[ProductCanonicalField, str | None]


class ProductImportRowOut(BaseModel):
    id: str
    row_number: int
    matched_product_id: str | None = None
    name: str | None = None
    identifier_value: str | None = None
    category_name: str | None = None
    cost_price: float | None = None
    selling_price: float | None = None
    tax_rate_percent: float | None = None
    barcode: str | None = None
    status: ImportRowStatus
    error_messages: list[str] = []
    is_skipped: bool


class ProductImportRowListOut(BaseModel):
    import_id: str
    status: str
    items: list[ProductImportRowOut]
    total: int
    ready_count: int
    warning_count: int
    error_count: int
    skipped_count: int


class ProductImportRowUpdateRequest(BaseModel):
    name: str | None = None
    identifier_value: str | None = None
    cost_price: float | None = None
    selling_price: float | None = None
    tax_rate_percent: float | None = None
    barcode: str | None = None
    is_skipped: bool | None = None


class ProductImportConfirmResponse(BaseModel):
    import_id: str
    status: str
    rows_imported: int
    rows_failed: int
    rows_skipped: int


class ProductImportHistoryOut(BaseModel):
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


class ProductImportHistoryListOut(BaseModel):
    items: list[ProductImportHistoryOut]
    total: int
    page: int
    page_size: int
