from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.domain.schemas import CommonObjectCreate


def base_payload() -> dict[str, object]:
    return {
        "object_type": "Observation",
        "source_id": "synthetic-source",
        "source_type": "SYNTHETIC",
        "collector_id": "synthetic-collector",
        "source_reference": "urn:kam:synthetic:test",
        "observed_at": datetime.now(timezone.utc),
        "geometry": {"type": "Point", "coordinates": [32.85, 39.93]},
        "raw_object_uri": "s3://synthetic/test.json",
        "normalized_payload": {"label": "SENTETİK"},
        "content_hash": "a" * 64,
        "classification": "UNCLASSIFIED",
        "tenant_id": "synthetic-tenant",
        "source_reliability": 6,
        "information_credibility": 6,
        "licence_or_usage_basis": "SYNTHETIC_TEST_DATA",
        "retention_policy": {"days": 1},
        "is_synthetic": True,
    }


def test_synthetic_common_object_is_accepted() -> None:
    record = CommonObjectCreate.model_validate(base_payload())
    assert record.is_synthetic


def test_unmarked_synthetic_and_invalid_geojson_are_rejected() -> None:
    unmarked = {**base_payload(), "is_synthetic": False}
    with pytest.raises(ValidationError, match="is_synthetic"):
        CommonObjectCreate.model_validate(unmarked)
    invalid_geometry = {**base_payload(), "geometry": {"type": "Feature", "coordinates": []}}
    with pytest.raises(ValidationError, match="GeoJSON"):
        CommonObjectCreate.model_validate(invalid_geometry)

