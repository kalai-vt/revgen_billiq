from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.invoice_template import DOCUMENT_TYPES

DocumentType = Literal[
    "tax_invoice", "estimate", "quotation", "proforma",
    "delivery_challan", "credit_note", "debit_note", "receipt",
]
HeaderLayout = Literal["logo-left", "logo-center", "logo-right", "banner", "minimal", "modern-card"]
HeaderHeight = Literal["compact", "normal", "tall"]
ItemColumnKey = Literal[
    "row_number", "product", "sku", "barcode", "hsn_sac", "batch", "expiry", "serial",
    "description", "qty", "unit", "mrp", "selling_price", "discount", "tax", "amount",
]
ColumnAlign = Literal["left", "center", "right"]
FooterKey = Literal["thank_you", "return_policy", "exchange_policy", "warranty", "terms_conditions", "business_notes"]
FontFamily = Literal["sans", "serif", "mono"]
FontSize = Literal["sm", "md", "lg"]
BorderStyle = Literal["solid", "dashed", "none"]
TableStyle = Literal["grid", "striped", "minimal"]
DividerStyle = Literal["solid", "dashed", "dotted"]
CornerRadius = Literal["none", "sm", "md", "lg"]
IconStyle = Literal["outline", "filled"]
PaperSize = Literal["58mm", "80mm", "A5", "A4", "letter", "legal", "custom"]
Orientation = Literal["portrait", "landscape"]
LogoSizePreset = Literal["sm", "md", "lg"]


class BrandingConfig(BaseModel):
    show_logo: bool = True
    show_business_name: bool = True
    show_tagline: bool = False
    show_address: bool = True
    show_phone: bool = True
    show_email: bool = False
    show_website: bool = False
    show_gstin: bool = True
    show_pan: bool = False
    show_fssai: bool = False
    show_drug_license: bool = False
    show_msme_udyam: bool = False
    show_social_links: bool = False
    social_links_to_show: list[str] = Field(default_factory=list)


class HeaderConfig(BaseModel):
    layout: HeaderLayout = "logo-left"
    background_color: str | None = None
    show_border: bool = True
    show_divider: bool = True
    border_radius: int = 0
    height_preset: HeaderHeight = "normal"


class InvoiceInfoFields(BaseModel):
    invoice_number: bool = True
    date: bool = True
    time: bool = False
    due_date: bool = False
    cashier: bool = False
    counter: bool = False
    order_number: bool = False
    customer_id: bool = False
    payment_method: bool = True
    payment_status: bool = False
    invoice_status: bool = False


class InvoiceInfoConfig(BaseModel):
    fields: InvoiceInfoFields = Field(default_factory=InvoiceInfoFields)


class CustomerDetailsFields(BaseModel):
    name: bool = True
    mobile: bool = True
    email: bool = False
    address: bool = False
    gstin: bool = False
    loyalty_number: bool = False
    membership: bool = False
    company_name: bool = False


class CustomerDetailsConfig(BaseModel):
    fields: CustomerDetailsFields = Field(default_factory=CustomerDetailsFields)


class ItemColumn(BaseModel):
    key: ItemColumnKey
    visible: bool = True
    order: int = 0
    width: float | None = None
    align: ColumnAlign = "left"


class ItemTableConfig(BaseModel):
    columns: list[ItemColumn] = Field(default_factory=list)
    show_borders: bool = True
    alternate_row_colors: bool = True


class TaxSummaryFields(BaseModel):
    subtotal: bool = True
    discount: bool = True
    cgst: bool = False
    sgst: bool = False
    igst: bool = False
    cess: bool = False
    round_off: bool = False
    shipping: bool = False
    packing: bool = False
    grand_total: bool = True
    paid: bool = False
    outstanding: bool = False
    balance: bool = False
    amount_in_words: bool = False


class TaxSummaryConfig(BaseModel):
    fields: TaxSummaryFields = Field(default_factory=TaxSummaryFields)


class FooterSection(BaseModel):
    key: FooterKey
    enabled: bool = False
    text: str = ""
    order: int = 0


class FooterConfig(BaseModel):
    sections: list[FooterSection] = Field(default_factory=list)


class QrBarcodeConfig(BaseModel):
    invoice_qr: bool = False
    payment_qr: bool = False
    business_qr: bool = False
    website_qr: bool = False
    feedback_qr: bool = False
    barcode: bool = False


class ThemeConfig(BaseModel):
    primary_color: str = "#1f2937"
    secondary_color: str = "#4b5563"
    accent_color: str = "#2563eb"
    font_family: FontFamily = "sans"
    font_size: FontSize = "md"
    border_style: BorderStyle = "solid"
    table_style: TableStyle = "grid"
    divider_style: DividerStyle = "solid"
    corner_radius: CornerRadius = "sm"
    icon_style: IconStyle = "outline"


class MarginMm(BaseModel):
    top: float = 18
    right: float = 18
    bottom: float = 18
    left: float = 18


class PaperConfig(BaseModel):
    size: PaperSize = "A4"
    custom_width_mm: float | None = None
    custom_height_mm: float | None = None
    orientation: Orientation = "portrait"
    margin_mm: MarginMm = Field(default_factory=MarginMm)
    logo_size_preset: LogoSizePreset = "md"
    font_scale_percent: int = Field(default=100, ge=50, le=200)
    auto_fit: bool = True


class InvoiceTemplateConfig(BaseModel):
    version: Literal[1] = 1
    branding: BrandingConfig = Field(default_factory=BrandingConfig)
    header: HeaderConfig = Field(default_factory=HeaderConfig)
    invoice_info: InvoiceInfoConfig = Field(default_factory=InvoiceInfoConfig)
    customer_details: CustomerDetailsConfig = Field(default_factory=CustomerDetailsConfig)
    item_table: ItemTableConfig = Field(default_factory=ItemTableConfig)
    tax_summary: TaxSummaryConfig = Field(default_factory=TaxSummaryConfig)
    footer: FooterConfig = Field(default_factory=FooterConfig)
    qr_barcode: QrBarcodeConfig = Field(default_factory=QrBarcodeConfig)
    theme: ThemeConfig = Field(default_factory=ThemeConfig)
    paper: PaperConfig = Field(default_factory=PaperConfig)


class InvoiceTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    document_type: DocumentType
    name: str
    is_default: bool
    is_builtin: bool
    config: InvoiceTemplateConfig


class InvoiceTemplateCreate(BaseModel):
    document_type: DocumentType
    name: str = Field(min_length=1, max_length=100)
    config: InvoiceTemplateConfig | None = None


class InvoiceTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    config: InvoiceTemplateConfig | None = None


assert set(DocumentType.__args__) == set(DOCUMENT_TYPES)  # keep schema/model enums in lockstep
