from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

VendorSortField = str  # "name" | "outstanding_amount" | "created_at"


class VendorCreate(BaseModel):
    name: str = Field(min_length=1)
    company_name: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    gst_number: str | None = None
    address: str | None = None
    payment_terms_days: int | None = Field(default=None, ge=0)
    credit_limit: float = Field(default=0.0, ge=0)
    notes: str | None = None


class VendorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    company_name: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    gst_number: str | None = None
    address: str | None = None
    payment_terms_days: int | None = Field(default=None, ge=0)
    credit_limit: float | None = Field(default=None, ge=0)
    is_active: bool | None = None
    notes: str | None = None


class VendorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    name: str
    company_name: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    gst_number: str | None = None
    address: str | None = None
    payment_terms_days: int | None = None
    credit_limit: float
    outstanding_amount: float
    is_active: bool
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class VendorListOut(BaseModel):
    items: list[VendorOut]
    total: int
    page: int
    page_size: int
