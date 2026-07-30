from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class CheckoutOut(BaseModel):
    order_id: str
    amount_inr: int
    currency: str
    razorpay_key_id: str
    plan: str
    plan_label: str


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class SubscriptionPaymentOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    plan: str
    amount_inr: int
    status: str
    created_at: datetime
    paid_at: datetime | None
