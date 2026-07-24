from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.catalog import Category, Product
from app.schemas.category import CategoryCreate, CategoryUpdate


class CategoryError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


_SORTABLE_FIELDS = {"name": Category.name, "created_at": Category.created_at}


def list_categories(db: Session, tenant_id: str, sort_by: str = "name", sort_dir: str = "asc") -> list[Category]:
    sort_column = _SORTABLE_FIELDS.get(sort_by, Category.name)
    order = sort_column.asc() if sort_dir == "asc" else sort_column.desc()
    return db.query(Category).filter(Category.tenant_id == tenant_id).order_by(order).all()


def create_category(db: Session, tenant_id: str, payload: CategoryCreate) -> Category:
    category = Category(tenant_id=tenant_id, **payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def get_category(db: Session, tenant_id: str, category_id: str) -> Category | None:
    return db.query(Category).filter(Category.tenant_id == tenant_id, Category.id == category_id).first()


def update_category(db: Session, category: Category, payload: CategoryUpdate) -> Category:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def delete_category(db: Session, category: Category) -> None:
    in_use = db.query(Product).filter(Product.category_id == category.id).first()
    if in_use:
        raise CategoryError(400, "Cannot delete a category that is still assigned to products")
    db.delete(category)
    db.commit()
