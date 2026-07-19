from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app


@pytest.fixture()
def client() -> TestClient:
    get_settings.cache_clear()
    return TestClient(create_app())


def test_list_connectors_returns_registry(client: TestClient) -> None:
    response = client.get("/connectors")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) >= 12
    valid = {
        "CONFIGURATION_REQUIRED", "DISABLED", "IDLE", "ACTIVE",
        "DEGRADED", "RATE_LIMITED", "CIRCUIT_OPEN", "FAILED",
    }
    for row in body:
        assert row["state"] in valid
        assert row["licence_or_usage_basis"]


def test_key_required_connector_is_configuration_required(client: TestClient) -> None:
    # aisstream needs a secret; without it, it must never be ACTIVE.
    response = client.get("/connectors/aisstream")
    assert response.status_code == 200
    assert response.json()["state"] == "CONFIGURATION_REQUIRED"


def test_unknown_connector_returns_structured_404(client: TestClient) -> None:
    response = client.get("/connectors/does_not_exist")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "CONNECTOR_NOT_FOUND"
    assert "correlation_id" in body["error"]


def test_health_is_liveness_only(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["service"] == "kam-ingestion"


def test_ready_reports_registry(client: TestClient) -> None:
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json()["checks"]["connector_registry"]["status"] == "ready"
