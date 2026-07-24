from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

StockReason = Literal["purchase", "damage", "return", "adjustment", "opening_stock", "manual_correction"]
MovementType = Literal["add", "reduce", "adjust"]
CanonicalField = Literal[
    "pid", "sku", "product_name", "category", "quantity", "cost_price", "selling_price", "tax_percent", "notes"
]
ImportRowStatus = Literal["ready", "warning", "error"]


class InventoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: str
    product_name: str
    identifier_type: str
    identifier_value: str
    category_name: str | None = None
    quantity: float
    reorder_level: float
    cost_price: float
    selling_price: float
    tax_rate_percent: float
    is_low_stock: bool
    is_out_of_stock: bool
    updated_at: datetime


class InventoryDashboardOut(BaseModel):
    total_products: int
    total_stock_quantity: float
    inventory_value: float
    low_stock_count: int
    out_of_stock_count: int
    recently_updated: list[InventoryOut]


class StockAdjustRequest(BaseModel):
    movement_type: MovementType
    quantity: float = Field(ge=0)
    reason: StockReason
    notes: str | None = None


class StockHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    product_name: str
    previous_stock: float
    added: float
    removed: float
    current_stock: float
    reason: str
    source: str
    notes: str | None = None
    created_by: str
    created_by_name: str
    created_at: datetime


class ImportUploadResponse(BaseModel):
    import_id: str
    file_name: str
    source_type: str
    status: str
    rows_total: int
    detected_headers: list[str]
    auto_mapping: dict[CanonicalField, str | None]
    requires_mapping: bool


class ColumnMappingRequest(BaseModel):
    mapping: dict[CanonicalField, str | None]


class ImportRowOut(BaseModel):
    id: str
    row_number: int
    matched_product_id: str | None = None
    product_name: str | None = None
    current_stock: float | None = None
    quantity: float | None = None
    cost_price: float | None = None
    selling_price: float | None = None
    tax_percent: float | None = None
    notes: str | None = None
    status: ImportRowStatus
    error_messages: list[str] = []
    is_skipped: bool


class ImportRowListOut(BaseModel):
    import_id: str
    status: str
    items: list[ImportRowOut]
    total: int
    ready_count: int
    warning_count: int
    error_count: int
    skipped_count: int


class ImportRowUpdateRequest(BaseModel):
    quantity: float | None = None
    cost_price: float | None = None
    selling_price: float | None = None
    tax_percent: float | None = None
    notes: str | None = None
    is_skipped: bool | None = None


class ImportConfirmResponse(BaseModel):
    import_id: str
    status: str
    rows_imported: int
    rows_failed: int
    rows_skipped: int


class ImportHistoryOut(BaseModel):
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


class ImportHistoryListOut(BaseModel):
    items: list[ImportHistoryOut]
    total: int
    page: int
    page_size: int
