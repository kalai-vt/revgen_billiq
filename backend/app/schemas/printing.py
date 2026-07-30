from __future__ import annotations

from pydantic import BaseModel


class QzCertificateOut(BaseModel):
    certificate: str


class QzSignRequest(BaseModel):
    to_sign: str


class QzSignOut(BaseModel):
    signature: str
