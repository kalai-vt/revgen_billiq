from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.limits import assert_feature, require_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.commerce import orders_service as service
from app.schemas.commerce import CommerceProductMappingCreate, CommerceProductMappingOut, MockOrderTriggerRequest

router = APIRouter(prefix="/api/commerce", tags=["commerce-orders"], dependencies=[Depends(require_feature("commerce"))])


@router.get("/orders")
def get_orders(
    platform: str | None = None,
    status: str | None = None,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_orders(db, current_user.tenant_id, platform=platform, status=status, q=q, page=page, page_size=page_size)
    return make_response(
        True,
        "Orders loaded",
        {"items": [i.model_dump(mode="json") for i in items], "total": total, "page": page, "page_size": page_size},
    )


@router.post("/orders/mock-trigger")
def post_mock_trigger(
    payload: MockOrderTriggerRequest,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    assert_feature(db, current_user.tenant_id, f"commerce_{payload.platform}")
    order = service.trigger_mock_order(db, current_user.tenant_id, current_user, payload.platform, payload.item_count)
    out = service.to_order_out(db, order)
    return make_response(True, "Mock order created", out.model_dump(mode="json"))


@router.post("/orders/{order_id}/retry-billing")
def post_retry_billing(
    order_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    order = service.get_order(db, current_user.tenant_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    success, error = service.retry_billing(db, order)
    if not success:
        raise HTTPException(status_code=400, detail=error or "Could not bill this order")
    out = service.to_order_out(db, order)
    return make_response(True, "Order billed", out.model_dump(mode="json"))


@router.get("/product-mappings")
def get_product_mappings(
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from app.models.catalog import Product

    mappings = service.list_mappings(db, current_user.tenant_id)
    out: list[dict[str, Any]] = []
    for m in mappings:
        product = db.get(Product, m.product_id)
        item = CommerceProductMappingOut.model_validate(m)
        item.product_name = product.name if product else ""
        out.append(item.model_dump(mode="json"))
    return make_response(True, "Product mappings loaded", out)


@router.post("/product-mappings")
def post_product_mapping(
    payload: CommerceProductMappingCreate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    mapping = service.create_mapping(db, current_user.tenant_id, payload)
    return make_response(True, "Product mapped", CommerceProductMappingOut.model_validate(mapping).model_dump(mode="json"))


@router.get("/unmapped-skus")
def get_unmapped_skus(
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items = service.list_unmapped_skus(db, current_user.tenant_id)
    return make_response(True, "Unmapped SKUs loaded", [i.model_dump(mode="json") for i in items])


# NOTE: catch-all single-segment route stays LAST among GET /orders/* routes.
@router.get("/orders/{order_id}")
def get_order_detail(
    order_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    order = service.get_order(db, current_user.tenant_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    out = service.to_order_out(db, order)
    return make_response(True, "Order loaded", out.model_dump(mode="json"))
