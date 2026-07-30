from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

PAYMENT_STATUSES = ("created", "paid", "failed")


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SubscriptionPayment(Base):
    """One row per Razorpay order created for a tenant to pay for their admin-assigned plan.
    Tenants never choose a plan here — this only ever charges for `Settings.plan`'s current
    price, so it can't be used to self-upgrade (see `create_checkout_order`)."""

    __tablename__ = "subscription_payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    plan: Mapped[str] = mapped_column(String(20))
    amount_inr: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="created", index=True)
    razorpay_order_id: Mapped[str] = mapped_column(String(64), index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
