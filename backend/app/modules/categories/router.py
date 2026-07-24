from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.responses import make_response
from app.models.user import User
from app.modules.categories import service
from app.modules.categories.service import CategoryError
from app.schemas.category import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/api", tags=["categories"])


@router.get("/categories")
def get_categories(
    sort_by: Literal["name", "created_at"] = Query(default="name"),
    sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items = service.list_categories(db, current_user.tenant_id, sort_by=sort_by, sort_dir=sort_dir)
    return make_response(
        True, "Categories loaded", {"items": [CategoryOut.model_validate(i).model_dump(mode="json") for i in items]}
    )


@router.post("/categories")
def post_category(
    payload: CategoryCreate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    category = service.create_category(db, current_user.tenant_id, payload)
    return make_response(True, "Category created", CategoryOut.model_validate(category).model_dump(mode="json"))


@router.put("/categories/{category_id}")
def put_category(
    category_id: str,
    payload: CategoryUpdate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    category = service.get_category(db, current_user.tenant_id, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    category = service.update_category(db, category, payload)
    return make_response(True, "Category updated", CategoryOut.model_validate(category).model_dump(mode="json"))


@router.delete("/categories/{category_id}")
def remove_category(
    category_id: str,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    category = service.get_category(db, current_user.tenant_id, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    try:
        service.delete_category(db, category)
    except CategoryError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Category deleted", {})
