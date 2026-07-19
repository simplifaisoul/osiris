from __future__ import annotations

from datetime import datetime, timezone

from app.connectors.base import SYNTHETIC_MARKER, BaseConnector, RawObservation
from tests.conftest import make_manifest


class _StaticConnector(BaseConnector):
    async def fetch(self, cursor):  # pragma: no cover - not exercised here
        return []


def _raw() -> RawObservation:
    return RawObservation(
        provider_id="abc-1",
        observed_at=datetime(2026, 7, 19, 12, 0, 0, tzinfo=timezone.utc),
        raw_reference="synthetic://test/abc-1",
        payload={"speed": 400, "heading": 270},
        geometry={"type": "Point", "coordinates": [29.0, 41.0]},
        country="TR",
    )


def test_synthetic_mapping_is_labelled() -> None:
    conn = _StaticConnector(make_manifest(common_object_type="Aircraft"), synthetic=True)
    obj = conn.to_common_object(_raw(), tenant_id="t-1")

    assert obj["is_synthetic"] is True
    assert obj["source_type"] == "SYNTHETIC"
    assert obj["normalized_payload"]["synthetic_marker"] == SYNTHETIC_MARKER
    assert obj["object_type"] == "Aircraft"
    assert obj["tenant_id"] == "t-1"
    # mandatory provenance fields present
    assert obj["licence_or_usage_basis"]
    assert obj["retention_policy"]["raw_retention_days"] == 7
    assert obj["chain_of_custody"][0]["action"] == "collected"
    assert len(obj["content_hash"]) == 64


def test_live_mapping_uses_provider_source_type() -> None:
    conn = _StaticConnector(make_manifest(provider="OpenSky Network"), synthetic=False)
    obj = conn.to_common_object(_raw(), tenant_id="t-1")
    assert obj["is_synthetic"] is False
    assert obj["source_type"] == "OPENSKY NETWORK"
    assert "synthetic_marker" not in obj["normalized_payload"]


def test_same_record_hashes_identically() -> None:
    conn = _StaticConnector(make_manifest(), synthetic=True)
    first = conn.to_common_object(_raw(), tenant_id="t-1")
    second = conn.to_common_object(_raw(), tenant_id="t-1")
    assert first["content_hash"] == second["content_hash"]
