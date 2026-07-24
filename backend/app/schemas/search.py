from __future__ import annotations

from pydantic import BaseModel


class SearchResultItem(BaseModel):
    id: str
    label: str
    subtitle: str | None = None


class GlobalSearchOut(BaseModel):
    products: list[SearchResultItem] = []
    customers: list[SearchResultItem] = []
    inventory: list[SearchResultItem] = []
    invoices: list[SearchResultItem] = []
    categories: list[SearchResultItem] = []
