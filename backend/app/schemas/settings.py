from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.catalog import IdentifierType

PrimarySearchField = Literal["name", "identifier_value", "barcode", "category"]
DateFormat = Literal["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]
DefaultPaymentMethod = Literal["cash", "card", "upi"]


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    logo_url: str | None = None
    gst_number: str | None = None
    invoice_prefix: str
    currency: str
    theme: str
    plan: str
    allow_manager_price_override: bool
    primary_search_field: PrimarySearchField
    default_identifier_type: IdentifierType
    enable_multiple_identifiers: bool
    require_unique_identifier: bool
    starting_invoice_number: int
    receipt_footer: str | None = None
    decimal_precision: int
    date_format: DateFormat
    default_tax_percent: float
    allow_discounts: bool
    auto_print_after_checkout: bool
    enable_barcode: bool
    enable_customer_selection: bool
    allow_negative_stock: bool
    default_low_stock_threshold: float
    default_payment_method: DefaultPaymentMethod
    tagline: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    website: str | None = None
    pan_number: str | None = None
    fssai_number: str | None = None
    drug_license_number: str | None = None
    msme_udyam_number: str | None = None
    social_links: dict[str, str] | None = None
    feedback_url: str | None = None


class SettingsUpdate(BaseModel):
    logo_url: str | None = None
    gst_number: str | None = None
    invoice_prefix: str | None = None
    currency: str | None = None
    theme: Literal["light", "dark", "system"] | None = None
    plan: Literal["basic", "explore", "advance"] | None = None
    allow_manager_price_override: bool | None = None
    primary_search_field: PrimarySearchField | None = None
    default_identifier_type: IdentifierType | None = None
    enable_multiple_identifiers: bool | None = None
    require_unique_identifier: bool | None = None
    starting_invoice_number: int | None = Field(default=None, ge=1)
    receipt_footer: str | None = None
    decimal_precision: int | None = Field(default=None, ge=0, le=4)
    date_format: DateFormat | None = None
    default_tax_percent: float | None = Field(default=None, ge=0, le=100)
    allow_discounts: bool | None = None
    auto_print_after_checkout: bool | None = None
    enable_barcode: bool | None = None
    enable_customer_selection: bool | None = None
    allow_negative_stock: bool | None = None
    default_low_stock_threshold: float | None = Field(default=None, ge=0)
    default_payment_method: DefaultPaymentMethod | None = None
    tagline: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    website: str | None = None
    pan_number: str | None = None
    fssai_number: str | None = None
    drug_license_number: str | None = None
    msme_udyam_number: str | None = None
    social_links: dict[str, str] | None = None
    feedback_url: str | None = None


class ProductConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    default_identifier_type: IdentifierType
    enable_multiple_identifiers: bool
    primary_search_field: PrimarySearchField


class BrandingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    logo_url: str | None = None
    tagline: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    website: str | None = None
    pan_number: str | None = None
    fssai_number: str | None = None
    drug_license_number: str | None = None
    msme_udyam_number: str | None = None
    social_links: dict[str, str] | None = None
    feedback_url: str | None = None


class BusinessPreferencesOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    default_tax_percent: float
    allow_discounts: bool
    auto_print_after_checkout: bool
    enable_barcode: bool
    enable_customer_selection: bool
    default_payment_method: DefaultPaymentMethod
    decimal_precision: int
    date_format: DateFormat
