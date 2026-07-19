from __future__ import annotations

from pathlib import Path

from app.config import Settings
from app.connectors.manifest import load_manifests
from app.connectors.runner import ConnectorRunner


def filesystem_secret_available(secret_dir: Path):
    """Return a predicate reporting whether a named secret file exists and is non-empty."""

    def available(secret_name: str) -> bool:
        candidate = secret_dir / secret_name
        try:
            return candidate.is_file() and candidate.stat().st_size > 0
        except OSError:
            return False

    return available


def build_runner(settings: Settings) -> ConnectorRunner:
    """Construct a :class:`ConnectorRunner` from settings and on-disk manifests."""
    manifests = load_manifests(settings.connector_manifest_dir)
    return ConnectorRunner(
        manifests=manifests,
        deployment_profile=settings.deployment_profile,
        public_connectors_enabled=settings.public_connectors_enabled,
        secret_available=filesystem_secret_available(settings.connector_secret_dir),
        failure_threshold=settings.connector_circuit_failure_threshold,
        reset_timeout_seconds=settings.connector_circuit_reset_seconds,
        max_retries=settings.connector_max_retries,
    )
