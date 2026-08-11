from __future__ import annotations

from pydantic import BaseModel, Field


class PromotionConfigOut(BaseModel):
    """Central, RevGenAI-managed BillIQ promotional content — never tenant-specific."""

    version: str
    title: str
    description: str
    website: str
    phone: str
    cta_text: str
    # Present only when the request carried a valid tenant session — the tenant-specific
    # redirect URL to encode in that tenant's promotion QR code. Absent for anonymous callers.
    qr_url: str | None = None


class PromotionConfigUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=200)
    website: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, min_length=1, max_length=50)
    cta_text: str | None = Field(default=None, min_length=1, max_length=1000)


class PromotionAnalyticsDay(BaseModel):
    date: str
    qr_scans: int


class PromotionAnalyticsOut(BaseModel):
    total_qr_scans: int
    daily: list[PromotionAnalyticsDay]
    # These events depend on the external revgenai.in marketing site instrumenting the
    # ?source=invoice&tenant=<id> params passed through by the QR redirect — not tracked here.
    website_visits: int | None = None
    demo_requests: int | None = None
    trial_signups: int | None = None
