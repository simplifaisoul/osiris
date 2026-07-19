from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from app.config import get_settings
from app.connectors.manifest import ConnectorManifest, load_manifests

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = REPO_ROOT / "packages" / "contracts" / "schemas" / "connector-manifest.schema.json"


def test_all_shipped_manifests_load_and_are_unique() -> None:
    manifests = load_manifests(get_settings().connector_manifest_dir)
    assert len(manifests) >= 12
    ids = [m.id for m in manifests]
    assert len(ids) == len(set(ids))


def test_all_manifests_validate_against_json_schema() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    manifest_dir = get_settings().connector_manifest_dir
    for path in sorted(manifest_dir.glob("*.yaml")):
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        errors = sorted(validator.iter_errors(raw), key=lambda e: list(e.path))
        assert not errors, f"{path.name}: {[e.message for e in errors]}"


def test_authenticated_manifest_requires_secrets() -> None:
    with pytest.raises(ValidationError):
        ConnectorManifest.model_validate(
            {
                "id": "bad",
                "version": "1.0.0",
                "domain": "aviation",
                "display_name": "Bad Connector",
                "provider": "X",
                "licence_or_usage_basis": "test basis",
                "lawful_basis_reference": "test",
                "auth_type": "api_key",
                "required_secrets": [],  # invalid: api_key with no secrets
                "base_url": "https://example.invalid",
                "rate_limit": {"requests": 1, "per_seconds": 1},
                "poll_frequency_seconds": 60,
                "raw_retention_days": 30,
                "common_object_type": "Aircraft",
                "source_reliability": 3,
                "information_credibility": 3,
            }
        )


def test_invalid_domain_is_rejected() -> None:
    with pytest.raises(ValidationError):
        ConnectorManifest.model_validate(
            {
                "id": "bad_domain",
                "version": "1.0.0",
                "domain": "weather_balloons",  # not in the domain enum
                "display_name": "Bad Domain",
                "provider": "X",
                "licence_or_usage_basis": "test basis",
                "lawful_basis_reference": "test",
                "auth_type": "none",
                "base_url": "https://example.invalid",
                "rate_limit": {"requests": 1, "per_seconds": 1},
                "poll_frequency_seconds": 60,
                "raw_retention_days": 30,
                "common_object_type": "Event",
                "source_reliability": 3,
                "information_credibility": 3,
            }
        )
