from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings, get_settings
from app.main import create_app


@pytest.mark.asyncio
async def test_health_and_readiness(client: AsyncClient) -> None:
    health = await client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "operational"
    ready = await client.get("/ready")
    assert ready.status_code == 200
    assert ready.json()["checks"]["database"]["status"] == "ready"
    assert ready.json()["checks"]["audit_key"]["status"] == "ready"
    assert ready.json()["checks"]["institution_iam"]["status"] == "not_required"


@pytest.mark.asyncio
async def test_readiness_fails_closed_for_missing_security_prerequisites(tmp_path: Path) -> None:
    app = create_app()
    settings = Settings(
        environment="test",
        database_url="sqlite+aiosqlite:///:memory:",
        auth_required=True,
        oidc_issuer="",
        oidc_jwks_url="",
        audit_hmac_key_file=tmp_path / "missing-audit-key",
    )
    app.dependency_overrides[get_settings] = lambda: settings
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ready")

    assert response.status_code == 503
    checks = response.json()["checks"]
    assert checks["database"]["status"] == "unavailable"
    assert checks["security_configuration"]["status"] == "unavailable"
    assert checks["audit_key"]["status"] == "unavailable"
    assert checks["institution_iam"]["status"] == "unavailable"
