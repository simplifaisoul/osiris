from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from app.connectors.base import BaseConnector, Sink
from app.connectors.checkpoint import CheckpointStore, InMemoryCheckpointStore
from app.connectors.circuit_breaker import CircuitBreaker
from app.connectors.dedup import DedupStore
from app.connectors.manifest import ConnectorManifest
from app.connectors.state import (
    ConnectorRuntime,
    ConnectorState,
    ConnectorStatus,
    resolve_state,
)


class ConnectorError(Exception):
    """A recoverable connector failure (counts toward the circuit breaker)."""


class RateLimitError(ConnectorError):
    """The provider signalled a rate limit; the connector backs off."""


class ListSink:
    """Default in-memory sink collecting emitted common objects."""

    def __init__(self) -> None:
        self.records: list[dict[str, Any]] = []

    def emit(self, common_object: dict[str, Any]) -> None:
        self.records.append(common_object)


@dataclass
class RegistryEntry:
    manifest: ConnectorManifest
    configured: bool
    enabled: bool
    missing_secrets: list[str]
    runtime: ConnectorRuntime
    breaker: CircuitBreaker


@dataclass
class RunResult:
    connector_id: str
    state: ConnectorState
    emitted: int
    deduplicated: int
    skipped: bool = False
    error: str | None = None


@dataclass
class ConnectorRunner:
    """Owns the connector registry and executes ingestion cycles.

    ``secret_available`` decides whether a required secret is present; injecting
    it keeps the runner testable without touching the filesystem. In production
    it reads the mounted per-connector secret directory.
    """

    manifests: list[ConnectorManifest]
    deployment_profile: str
    public_connectors_enabled: bool
    secret_available: Callable[[str], bool]
    failure_threshold: int = 5
    reset_timeout_seconds: float = 30.0
    max_retries: int = 5
    dedup: DedupStore = field(default_factory=DedupStore)
    checkpoints: CheckpointStore = field(default_factory=InMemoryCheckpointStore)
    _entries: dict[str, RegistryEntry] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for manifest in self.manifests:
            missing = [s for s in manifest.required_secrets if not self.secret_available(s)]
            configured = len(missing) == 0
            enabled = self._is_enabled(manifest)
            self._entries[manifest.id] = RegistryEntry(
                manifest=manifest,
                configured=configured,
                enabled=enabled,
                missing_secrets=missing,
                runtime=ConnectorRuntime(configured=configured, enabled=enabled),
                breaker=CircuitBreaker(
                    failure_threshold=manifest.circuit_failure_threshold,
                    reset_timeout_seconds=self.reset_timeout_seconds,
                ),
            )

    def _is_enabled(self, manifest: ConnectorManifest) -> bool:
        # A public-network connector is disabled in the air-gapped profile or when
        # the global public switch is off. This is defence in depth alongside the
        # NetworkPolicy egress rules.
        if manifest.requires_public_network:
            if self.deployment_profile == "SPYS_AIRGAP":
                return False
            if not self.public_connectors_enabled:
                return False
        return True

    @property
    def ids(self) -> list[str]:
        return list(self._entries.keys())

    def entry(self, connector_id: str) -> RegistryEntry:
        if connector_id not in self._entries:
            raise KeyError(connector_id)
        return self._entries[connector_id]

    def status(self, connector_id: str) -> ConnectorStatus:
        entry = self.entry(connector_id)
        state = resolve_state(entry.runtime, failure_threshold=self.failure_threshold)
        return ConnectorStatus(
            connector_id=entry.manifest.id,
            domain=entry.manifest.domain,
            state=state,
            licence_or_usage_basis=entry.manifest.licence_or_usage_basis,
            last_success_at=entry.runtime.last_success_at,
            consecutive_failures=entry.runtime.consecutive_failures,
            records_ingested=entry.runtime.records_ingested,
            records_deduplicated=entry.runtime.records_deduplicated,
            last_error=entry.runtime.last_error,
            missing_configuration=entry.missing_secrets,
        )

    def statuses(self) -> list[ConnectorStatus]:
        return [self.status(cid) for cid in self._entries]

    async def run_once(
        self,
        connector_id: str,
        connector: BaseConnector,
        *,
        tenant_id: str,
        sink: Sink | None = None,
        now: float = 0.0,
    ) -> RunResult:
        """Execute one ingestion cycle for a connector.

        Honours configuration, enablement, and the circuit breaker before calling
        the provider. On success, normalizes and de-duplicates records into the
        sink; on failure, advances the breaker and records the error.
        """
        entry = self.entry(connector_id)
        sink = sink if sink is not None else ListSink()

        if not entry.configured:
            return RunResult(connector_id, ConnectorState.CONFIGURATION_REQUIRED, 0, 0, skipped=True)
        if not entry.enabled:
            return RunResult(connector_id, ConnectorState.DISABLED, 0, 0, skipped=True)

        entry.runtime.rate_limited = False
        if not entry.breaker.allows(now):
            entry.runtime.circuit_open = True
            return RunResult(connector_id, ConnectorState.CIRCUIT_OPEN, 0, 0, skipped=True)
        entry.runtime.circuit_open = False

        cursor = self.checkpoints.get(connector_id)
        try:
            raw_records = await self._fetch_with_retry(connector, cursor)
        except RateLimitError as exc:
            entry.runtime.rate_limited = True
            entry.runtime.consecutive_failures += 1
            entry.runtime.last_error = str(exc)
            entry.breaker.record_failure(now)
            entry.runtime.circuit_open = entry.breaker.is_open
            return RunResult(connector_id, self._current_state(entry), 0, 0, error=str(exc))
        except ConnectorError as exc:
            entry.runtime.consecutive_failures += 1
            entry.runtime.last_error = str(exc)
            entry.breaker.record_failure(now)
            entry.runtime.circuit_open = entry.breaker.is_open
            return RunResult(connector_id, self._current_state(entry), 0, 0, error=str(exc))

        emitted = 0
        deduplicated = 0
        latest_cursor = cursor
        for raw in raw_records:
            common = connector.to_common_object(raw, tenant_id=tenant_id)
            if self.dedup.is_new(common["content_hash"]):
                sink.emit(common)
                emitted += 1
            else:
                deduplicated += 1
            latest_cursor = raw.observed_at.isoformat()

        entry.breaker.record_success()
        entry.runtime.circuit_open = False
        entry.runtime.consecutive_failures = 0
        entry.runtime.has_run = True
        entry.runtime.last_success_at = datetime.now(timezone.utc)
        entry.runtime.last_error = None
        entry.runtime.records_ingested += emitted
        entry.runtime.records_deduplicated += deduplicated
        if latest_cursor and entry.manifest.checkpoint_strategy != "none":
            self.checkpoints.set(connector_id, latest_cursor)

        return RunResult(connector_id, self._current_state(entry), emitted, deduplicated)

    async def _fetch_with_retry(
        self, connector: BaseConnector, cursor: str | None
    ) -> list[Any]:
        attempts = 0
        last_exc: Exception | None = None
        while attempts <= self.max_retries:
            try:
                return await connector.fetch(cursor)
            except RateLimitError:
                raise
            except ConnectorError as exc:
                last_exc = exc
                attempts += 1
        assert last_exc is not None
        raise last_exc

    def _current_state(self, entry: RegistryEntry) -> ConnectorState:
        return resolve_state(entry.runtime, failure_threshold=self.failure_threshold)
