from __future__ import annotations

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.activity import ACTION_CREATED, ACTION_DELETED, ACTION_UPDATED, MODULE_PRODUCT, log_activity
from app.core.barcode import generate_ean13
from app.core.limits import assert_feature, assert_under_limit, get_plan_config
from app.core.notifications import TYPE_NEW_PRODUCT, create_notification
from app.models.catalog import Category, Product, ProductIdentifier
from app.models.inventory import Inventory
from app.models.settings import Settings
from app.schemas.catalog import IdentifierItem, ProductCreate, ProductUpdate


class CatalogError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _assert_barcode_available(db: Session, barcode: str | None, exclude_id: str | None = None) -> None:
    if not barcode:
        return
    query = db.query(Product).filter(Product.barcode == barcode)
    if exclude_id:
        query = query.filter(Product.id != exclude_id)
    if query.first():
        raise CatalogError(400, f"Barcode '{barcode}' is already assigned to another product")


def _assert_identifier_available(
    db: Session, tenant_id: str, value: str, exclude_id: str | None = None
) -> None:
    settings = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    if settings and not settings.require_unique_identifier:
        return

    primary_query = db.query(Product).filter(Product.tenant_id == tenant_id, Product.identifier_value == value)
    if exclude_id:
        primary_query = primary_query.filter(Product.id != exclude_id)
    if primary_query.first():
        raise CatalogError(400, f"Identifier '{value}' is already used by another product")

    secondary_query = db.query(ProductIdentifier).filter(
        ProductIdentifier.tenant_id == tenant_id, ProductIdentifier.identifier_value == value
    )
    if exclude_id:
        secondary_query = secondary_query.filter(ProductIdentifier.product_id != exclude_id)
    if secondary_query.first():
        raise CatalogError(400, f"Identifier '{value}' is already used by another product")


def check_duplicate(
    db: Session,
    tenant_id: str,
    name: str | None,
    identifier_value: str | None,
    barcode: str | None,
    exclude_id: str | None = None,
) -> dict[str, Product | None]:
    name_match: Product | None = None
    if name and name.strip():
        query = db.query(Product).filter(
            Product.tenant_id == tenant_id, func.lower(Product.name) == name.strip().lower()
        )
        if exclude_id:
            query = query.filter(Product.id != exclude_id)
        name_match = query.first()

    identifier_match: Product | None = None
    if identifier_value:
        settings = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
        if not settings or settings.require_unique_identifier:
            primary_query = db.query(Product).filter(
                Product.tenant_id == tenant_id, Product.identifier_value == identifier_value
            )
            if exclude_id:
                primary_query = primary_query.filter(Product.id != exclude_id)
            identifier_match = primary_query.first()

            if not identifier_match:
                secondary_query = db.query(ProductIdentifier).filter(
                    ProductIdentifier.tenant_id == tenant_id,
                    ProductIdentifier.identifier_value == identifier_value,
                )
                if exclude_id:
                    secondary_query = secondary_query.filter(ProductIdentifier.product_id != exclude_id)
                secondary = secondary_query.first()
                if secondary:
                    identifier_match = db.get(Product, secondary.product_id)

    barcode_match: Product | None = None
    if barcode:
        barcode_query = db.query(Product).filter(Product.barcode == barcode)
        if exclude_id:
            barcode_query = barcode_query.filter(Product.id != exclude_id)
        barcode_match = barcode_query.first()

    return {"name_match": name_match, "identifier_match": identifier_match, "barcode_match": barcode_match}


def _validate_custom_label(identifier_type: str, identifier_label: str | None) -> None:
    if identifier_type == "custom" and not (identifier_label and identifier_label.strip()):
        raise CatalogError(400, "A label is required when Identifier Type is Custom")


def _validate_identifiers(
    db: Session,
    tenant_id: str,
    identifier_type: str,
    identifier_label: str | None,
    identifier_value: str,
    additional_identifiers: list[IdentifierItem] | None,
    exclude_id: str | None = None,
) -> None:
    _validate_custom_label(identifier_type, identifier_label)
    _assert_identifier_available(db, tenant_id, identifier_value, exclude_id=exclude_id)

    if not additional_identifiers:
        return
    seen = {identifier_value}
    for item in additional_identifiers:
        _validate_custom_label(item.identifier_type, item.identifier_label)
        if item.identifier_value in seen:
            raise CatalogError(400, f"Identifier '{item.identifier_value}' is duplicated within this product")
        seen.add(item.identifier_value)
        _assert_identifier_available(db, tenant_id, item.identifier_value, exclude_id=exclude_id)


def _sync_additional_identifiers(
    db: Session, tenant_id: str, product_id: str, items: list[IdentifierItem]
) -> None:
    settings = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    if not settings or not settings.enable_multiple_identifiers:
        return
    db.query(ProductIdentifier).filter(ProductIdentifier.product_id == product_id).delete()
    for item in items:
        db.add(
            ProductIdentifier(
                tenant_id=tenant_id,
                product_id=product_id,
                identifier_type=item.identifier_type,
                identifier_label=item.identifier_label,
                identifier_value=item.identifier_value,
            )
        )


def _attach_category_names(db: Session, tenant_id: str, products: list[Product]) -> list[Product]:
    category_ids = {p.category_id for p in products if p.category_id}
    names_by_id: dict[str, str] = {}
    if category_ids:
        rows = (
            db.query(Category.id, Category.name)
            .filter(Category.tenant_id == tenant_id, Category.id.in_(category_ids))
            .all()
        )
        names_by_id = dict(rows)
    for product in products:
        product.category_name = names_by_id.get(product.category_id) if product.category_id else None  # type: ignore[attr-defined]
    return products


def _attach_additional_identifiers(db: Session, tenant_id: str, products: list[Product]) -> list[Product]:
    product_ids = [p.id for p in products]
    items_by_product: dict[str, list[ProductIdentifier]] = {}
    if product_ids:
        rows = (
            db.query(ProductIdentifier)
            .filter(ProductIdentifier.tenant_id == tenant_id, ProductIdentifier.product_id.in_(product_ids))
            .all()
        )
        for row in rows:
            items_by_product.setdefault(row.product_id, []).append(row)
    for product in products:
        product.additional_identifiers = items_by_product.get(product.id, [])  # type: ignore[attr-defined]
    return products


def _hydrate(db: Session, tenant_id: str, products: list[Product]) -> list[Product]:
    return _attach_additional_identifiers(db, tenant_id, _attach_category_names(db, tenant_id, products))


_SORTABLE_FIELDS = {
    "name": Product.name,
    "identifier_value": Product.identifier_value,
    "cost_price": Product.cost_price,
    "selling_price": Product.selling_price,
    "tax_rate_percent": Product.tax_rate_percent,
}


def list_products(
    db: Session,
    tenant_id: str,
    q: str | None = None,
    category_id: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "name",
    sort_dir: str = "asc",
) -> tuple[list[Product], int]:
    query = db.query(Product).filter(Product.tenant_id == tenant_id)
    if q:
        pattern = f"%{q}%"
        query = query.outerjoin(Category, Product.category_id == Category.id)
        conditions = [
            Product.name.ilike(pattern),
            Product.identifier_value.ilike(pattern),
            Product.barcode.ilike(pattern),
            Category.name.ilike(pattern),
        ]
        settings = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
        if settings and settings.enable_multiple_identifiers:
            secondary_matches = db.query(ProductIdentifier.product_id).filter(
                ProductIdentifier.tenant_id == tenant_id, ProductIdentifier.identifier_value.ilike(pattern)
            )
            conditions.append(Product.id.in_(secondary_matches))
        query = query.filter(or_(*conditions))
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if is_active is not None:
        query = query.filter(Product.is_active == is_active)

    total = query.with_entities(func.count(Product.id)).scalar() or 0
    sort_column = _SORTABLE_FIELDS.get(sort_by, Product.name)
    order = sort_column.asc() if sort_dir == "asc" else sort_column.desc()
    items = query.order_by(order).offset((page - 1) * page_size).limit(page_size).all()
    return _hydrate(db, tenant_id, items), total


def _filtered_products_query(
    db: Session, tenant_id: str, q: str | None, category_id: str | None, is_active: bool | None
):
    query = db.query(Product).filter(Product.tenant_id == tenant_id)
    if q:
        pattern = f"%{q}%"
        query = query.outerjoin(Category, Product.category_id == Category.id)
        conditions = [
            Product.name.ilike(pattern),
            Product.identifier_value.ilike(pattern),
            Product.barcode.ilike(pattern),
            Category.name.ilike(pattern),
        ]
        query = query.filter(or_(*conditions))
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if is_active is not None:
        query = query.filter(Product.is_active == is_active)
    return query


def list_products_for_export(
    db: Session, tenant_id: str, q: str | None = None, category_id: str | None = None, is_active: bool | None = None
) -> list[Product]:
    items = _filtered_products_query(db, tenant_id, q, category_id, is_active).order_by(Product.name).all()
    return _hydrate(db, tenant_id, items)


def create_product(db: Session, tenant_id: str, payload: ProductCreate, user_id: str | None = None) -> Product:
    _assert_barcode_available(db, payload.barcode)

    settings = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    barcode = payload.barcode
    if barcode:
        # A user-supplied barcode is a deliberate ask — gate it behind the plan feature.
        assert_feature(db, tenant_id, "barcode_support")
    elif settings and settings.enable_barcode and get_plan_config(db, tenant_id)["features"]["barcode_support"]:
        # Auto-generation is a convenience, not something the user asked for — silently skip
        # it on plans without barcode support rather than failing the whole product creation.
        barcode = generate_ean13(db)

    _validate_identifiers(
        db,
        tenant_id,
        payload.identifier_type,
        payload.identifier_label,
        payload.identifier_value,
        payload.additional_identifiers,
    )

    product_count = db.query(func.count(Product.id)).filter(Product.tenant_id == tenant_id).scalar() or 0
    assert_under_limit(db, tenant_id, "max_products", product_count)

    data = payload.model_dump(exclude={"additional_identifiers", "barcode"})
    product = Product(tenant_id=tenant_id, barcode=barcode, **data)
    db.add(product)
    db.flush()

    if payload.additional_identifiers is not None:
        _sync_additional_identifiers(db, tenant_id, product.id, payload.additional_identifiers)

    reorder_level = settings.default_low_stock_threshold if settings else 5.0
    db.add(Inventory(tenant_id=tenant_id, product_id=product.id, quantity=0.0, reorder_level=reorder_level))

    log_activity(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        module=MODULE_PRODUCT,
        action=ACTION_CREATED,
        description=f"Created product '{product.name}'",
        entity_type="Product",
        entity_id=product.id,
    )
    create_notification(
        db,
        tenant_id=tenant_id,
        type=TYPE_NEW_PRODUCT,
        title="New product added",
        message=f"'{product.name}' was added to your catalog.",
        entity_type="Product",
        entity_id=product.id,
    )

    db.commit()
    db.refresh(product)
    return _hydrate(db, tenant_id, [product])[0]


def get_product(db: Session, tenant_id: str, product_id: str) -> Product | None:
    product = db.query(Product).filter(Product.tenant_id == tenant_id, Product.id == product_id).first()
    if not product:
        return None
    return _hydrate(db, tenant_id, [product])[0]


def update_product(db: Session, product: Product, payload: ProductUpdate, user_id: str | None = None) -> Product:
    updates = payload.model_dump(exclude_unset=True, exclude={"additional_identifiers"})
    if "barcode" in updates:
        _assert_barcode_available(db, updates["barcode"], exclude_id=product.id)
        if updates["barcode"]:
            assert_feature(db, product.tenant_id, "barcode_support")

    final_type = updates.get("identifier_type", product.identifier_type)
    final_label = updates.get("identifier_label", product.identifier_label)
    final_value = updates.get("identifier_value", product.identifier_value)
    additional = (
        payload.additional_identifiers if "additional_identifiers" in payload.model_fields_set else None
    )
    _validate_identifiers(
        db, product.tenant_id, final_type, final_label, final_value, additional, exclude_id=product.id
    )

    for field, value in updates.items():
        setattr(product, field, value)
    db.add(product)
    db.flush()

    if "additional_identifiers" in payload.model_fields_set:
        _sync_additional_identifiers(db, product.tenant_id, product.id, payload.additional_identifiers or [])

    log_activity(
        db,
        tenant_id=product.tenant_id,
        user_id=user_id,
        module=MODULE_PRODUCT,
        action=ACTION_UPDATED,
        description=f"Updated product '{product.name}'",
        entity_type="Product",
        entity_id=product.id,
    )

    db.commit()
    db.refresh(product)
    return _hydrate(db, product.tenant_id, [product])[0]


def delete_product(db: Session, product: Product, user_id: str | None = None) -> None:
    log_activity(
        db,
        tenant_id=product.tenant_id,
        user_id=user_id,
        module=MODULE_PRODUCT,
        action=ACTION_DELETED,
        description=f"Deleted product '{product.name}'",
        entity_type="Product",
        entity_id=product.id,
    )
    db.query(ProductIdentifier).filter(ProductIdentifier.product_id == product.id).delete()
    db.query(Inventory).filter(Inventory.product_id == product.id).delete()
    db.delete(product)
    db.commit()
