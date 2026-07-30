from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.responses import make_response
from app.models.user import User
from app.modules.auth.service import get_tenant
from app.modules.subscription_billing import service
from app.modules.subscription_billing.service import BillingError
from app.schemas.subscription_billing import CheckoutOut, SubscriptionPaymentOut, VerifyPaymentRequest

router = APIRouter(prefix="/api/billing", tags=["subscription-billing"])


@router.post("/checkout")
def create_checkout(
    current_user: User = Depends(require_role("owner")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    tenant = get_tenant(db, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    try:
        order = service.create_checkout_order(db, tenant)
    except BillingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Checkout order created", CheckoutOut.model_validate(order).model_dump(mode="json"))


@router.post("/verify")
def verify_payment(
    payload: VerifyPaymentRequest,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = service.verify_and_activate(
            db,
            current_user.tenant_id,
            order_id=payload.razorpay_order_id,
            payment_id=payload.razorpay_payment_id,
            signature=payload.razorpay_signature,
        )
    except BillingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Payment confirmed", result)


@router.get("/payments")
def list_payments(
    current_user: User = Depends(require_role("owner")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    payments = service.list_payments(db, current_user.tenant_id)
    items = [SubscriptionPaymentOut.model_validate(p).model_dump(mode="json") for p in payments]
    return make_response(True, "Payment history loaded", items)


@router.post("/webhook", include_in_schema=False)
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")
    try:
        service.handle_webhook(db, body=body, signature=signature)
    except BillingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Webhook processed", None)
