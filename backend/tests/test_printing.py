from __future__ import annotations

import base64

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.printing import service as printing_service
from tests.conftest import register_and_activate_standalone


def _register(client: TestClient, email: str = "owner@acme.test", phone: str = "+15551234567") -> dict:
    return register_and_activate_standalone(
        client,
        {
            "company_name": "Acme Retail", "legal_name": "Acme Retail Ltd", "email": email,
            "phone": phone, "password": "StrongPass!123", "first_name": "Ada",
            "last_name": "Lovelace", "country": "US", "currency": "USD", "timezone": "UTC",
        },
    )


@pytest.fixture()
def qz_signing_configured(monkeypatch: pytest.MonkeyPatch):
    """Generates a throwaway RSA key pair for this test only (never written to disk, never
    committed) and points the app's QZ signing config at it, matching how a real deployment
    would look once REVGENIQ_QZ_TRAY_PRIVATE_KEY/CERTIFICATE are set. Resets the service
    module's cached key afterward so this can't leak into other tests in the same process."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    monkeypatch.setattr(settings, "qz_tray_private_key", private_pem)
    monkeypatch.setattr(settings, "qz_tray_certificate", "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----")
    monkeypatch.setattr(printing_service, "_private_key", None)
    yield key
    monkeypatch.setattr(printing_service, "_private_key", None)


def test_qz_certificate_requires_auth(client: TestClient) -> None:
    response = client.get("/api/printing/qz-certificate")
    assert response.status_code == 401


def test_qz_sign_requires_auth(client: TestClient) -> None:
    response = client.post("/api/printing/qz-sign", json={"to_sign": "anything"})
    assert response.status_code == 401


def test_certificate_endpoint_returns_empty_string_when_unconfigured(client: TestClient) -> None:
    owner = _register(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    response = client.get("/api/printing/qz-certificate", headers=headers)
    assert response.status_code == 200, response.text
    # Empty (the default, unconfigured) is a valid, expected state — the frontend degrades to
    # unsigned/anonymous QZ connections rather than erroring, see qzTraySigning.ts.
    assert response.json()["data"]["certificate"] == ""


def test_sign_endpoint_fails_cleanly_when_unconfigured(client: TestClient) -> None:
    owner = _register(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    response = client.post("/api/printing/qz-sign", json={"to_sign": "hello"}, headers=headers)
    assert response.status_code == 400
    assert "configured" in response.json()["detail"].lower()


def test_certificate_endpoint_returns_configured_certificate(client: TestClient, qz_signing_configured) -> None:
    owner = _register(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    response = client.get("/api/printing/qz-certificate", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["data"]["certificate"] == settings.qz_tray_certificate


def test_certificate_is_identical_for_two_different_tenants(client: TestClient, qz_signing_configured) -> None:
    """QZ Tray identifies the software vendor (BillIQ), not each individual tenant — a single
    shared certificate is the correct model, not a tenant isolation gap. This proves there's no
    accidental per-tenant branching that could reveal which tenant is asking."""
    first = _register(client, email="owner1@acme.test", phone="+15551234567")
    second = _register(client, email="owner2@acme.test", phone="+15559876543")
    cert1 = client.get("/api/printing/qz-certificate", headers={"Authorization": f"Bearer {first['access_token']}"}).json()
    cert2 = client.get("/api/printing/qz-certificate", headers={"Authorization": f"Bearer {second['access_token']}"}).json()
    assert cert1["data"]["certificate"] == cert2["data"]["certificate"]


def test_sign_endpoint_returns_a_cryptographically_valid_signature(
    client: TestClient, qz_signing_configured
) -> None:
    owner = _register(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    to_sign = "qz-tray-nonce-12345"

    response = client.post("/api/printing/qz-sign", json={"to_sign": to_sign}, headers=headers)
    assert response.status_code == 200, response.text
    signature_b64 = response.json()["data"]["signature"]

    # Verifies against the SAME key pair generated in the fixture — proves the backend actually
    # signed with the configured private key, using the exact algorithm (SHA512/PKCS1v15) the
    # frontend tells QZ Tray to expect (see qzTray.ts's setSignatureAlgorithm('SHA512')).
    public_key = qz_signing_configured.public_key()
    public_key.verify(base64.b64decode(signature_b64), to_sign.encode(), padding.PKCS1v15(), hashes.SHA512())


def test_sign_response_never_contains_private_key_material(client: TestClient, qz_signing_configured) -> None:
    owner = _register(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    response = client.post("/api/printing/qz-sign", json={"to_sign": "hello"}, headers=headers)
    body = response.json()
    assert set(body["data"].keys()) == {"signature"}
    assert "PRIVATE KEY" not in response.text


def test_sign_endpoint_rejects_a_malformed_private_key(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "qz_tray_private_key", "not a real pem key")
    monkeypatch.setattr(settings, "qz_tray_certificate", "cert")
    monkeypatch.setattr(printing_service, "_private_key", None)
    owner = _register(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    response = client.post("/api/printing/qz-sign", json={"to_sign": "hello"}, headers=headers)
    assert response.status_code == 400
    monkeypatch.setattr(printing_service, "_private_key", None)
