from __future__ import annotations

from typing import Any, Callable

import pytest

from app.connectors.manifest import ConnectorManifest
from app.connectors.runner import ConnectorRunner


def make_manifest(**overrides: Any) -> ConnectorManifest:
    """Build a valid manifest with airgap-safe defaults; override any field."""
    base: dict[str, Any] = {
        "id": "test_conn",
        "version": "1.0.0",
        "domain": "environment",
        "display_name": "Test Connector",
        "provider": "SYNTHETIC",
        "licence_or_usage_basis": "Synthetic test data; labelled SENTETİK.",
        "lawful_basis_reference": "Synthetic test data",
        "auth_type": "none",
        "required_secrets": [],
        "base_url": "synthetic://local",
        "rate_limit": {"requests": 1000, "per_seconds": 1},
        "poll_frequency_seconds": 60,
        "max_retries": 5,
        "circuit_failure_threshold": 5,
        "pagination": "none",
        "checkpoint_strategy": "timestamp",
        "dedup_key": "content_hash",
        "raw_retention_days": 7,
        "common_object_type": "Observation",
        "default_classification": "UNCLASSIFIED",
        "source_reliability": 6,
        "information_credibility": 6,
        "geocoding_required": False,
        "requires_public_network": False,
        "tags": ["synthetic", "test"],
    }
    base.update(overrides)
    return ConnectorManifest.model_validate(base)


def make_runner(
    manifests: list[ConnectorManifest],
    *,
    profile: str = "OSIRIS_CONNECTED",
    public_enabled: bool = True,
    secret_available: Callable[[str], bool] | None = None,
    failure_threshold: int = 5,
    max_retries: int = 5,
    reset_timeout_seconds: float = 30.0,
) -> ConnectorRunner:
    return ConnectorRunner(
        manifests=manifests,
        deployment_profile=profile,
        public_connectors_enabled=public_enabled,
        secret_available=secret_available or (lambda _s: True),
        failure_threshold=failure_threshold,
        max_retries=max_retries,
        reset_timeout_seconds=reset_timeout_seconds,
    )


@pytest.fixture
def manifest() -> ConnectorManifest:
    return make_manifest()
