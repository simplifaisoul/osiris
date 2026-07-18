from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient


def payload() -> dict[str, object]:
    return {
        "object_type": "Observation",
        "source_id": "synthetic-source",
        "source_type": "SYNTHETIC",
        "collector_id": "synthetic-collector",
        "source_reference": "urn:kam:synthetic:integration",
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "geometry": {"type": "Point", "coordinates": [32.85, 39.93]},
        "raw_object_uri": "s3://synthetic/integration.json",
        "normalized_payload": {"label": "SENTETİK"},
        "content_hash": "b" * 64,
        "classification": "UNCLASSIFIED",
        "tenant_id": "synthetic-tenant",
        "source_reliability": 6,
        "information_credibility": 6,
        "licence_or_usage_basis": "SYNTHETIC_TEST_DATA",
        "retention_policy": {"days": 1},
        "is_synthetic": True,
    }


@pytest.mark.asyncio
async def test_create_common_object_and_reject_bad_hash(client: AsyncClient) -> None:
    created = await client.post("/v1/objects", json=payload())
    assert created.status_code == 201, created.text
    assert created.json()["source_type"] == "SYNTHETIC"

    invalid = {**payload(), "content_hash": "not-a-sha256"}
    rejected = await client.post("/v1/objects", json=invalid)
    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "VALIDATION_ERROR"

