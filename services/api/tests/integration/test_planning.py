from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_shp_requires_exact_twenty_year_period(client: AsyncClient) -> None:
    base = {
        "tenant_id": "synthetic-tenant",
        "plan_type": "SHP",
        "code": "SYN.SHP.001",
        "serial_number": "SYN-001",
        "title": "SENTETİK SHP Projesi",
        "need_authority": "SENTETİK MAKAM",
        "justification": "Yalnızca entegrasyon kabul testi için sentetik gerekçe.",
        "tactical_requirements": "Gerçek harekât verisi içermeyen sentetik isterler.",
        "need_quantity": 1,
        "period_start": 2026,
        "period_end": 2045,
        "currency": "TRY",
        "estimated_amount": "1000.0000",
        "is_synthetic": True,
    }
    created = await client.post("/v1/planning/projects", json=base)
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "DRAFT"

    invalid = {**base, "serial_number": "SYN-002", "period_end": 2044}
    rejected = await client.post("/v1/planning/projects", json=invalid)
    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "VALIDATION_ERROR"

