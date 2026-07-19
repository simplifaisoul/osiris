from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


class ConnectorState(str, Enum):
    """The eight real connector states (OSIRIS §5).

    Precedence is resolved by :func:`resolve_state`; these are the only values a
    connector may report. A connector is never presented as ``ACTIVE`` unless it
    is fully configured and has produced a recent success.
    """

    CONFIGURATION_REQUIRED = "CONFIGURATION_REQUIRED"  # missing secret/key or manifest gap
    DISABLED = "DISABLED"                                # switched off by profile/config
    IDLE = "IDLE"                                        # configured, not yet run this lifetime
    ACTIVE = "ACTIVE"                                    # healthy, recent success
    DEGRADED = "DEGRADED"                                # some recent failures, still producing
    RATE_LIMITED = "RATE_LIMITED"                        # backing off due to provider limit
    CIRCUIT_OPEN = "CIRCUIT_OPEN"                        # breaker tripped, calls suspended
    FAILED = "FAILED"                                    # no recent success beyond tolerance


class ConnectorRuntime(BaseModel):
    """Mutable per-connector runtime signals used to compute the reported state."""

    configured: bool = False
    enabled: bool = True
    has_run: bool = False
    circuit_open: bool = False
    rate_limited: bool = False
    consecutive_failures: int = 0
    last_success_at: datetime | None = None
    last_error: str | None = None
    records_ingested: int = 0
    records_deduplicated: int = 0


def resolve_state(
    runtime: ConnectorRuntime,
    *,
    failure_threshold: int,
    now: datetime | None = None,
) -> ConnectorState:
    """Map runtime signals to a single reported state, highest precedence first.

    The ordering is deliberate: configuration and operator intent dominate
    transient health so a mis-keyed connector can never masquerade as live.
    """

    if not runtime.configured:
        return ConnectorState.CONFIGURATION_REQUIRED
    if not runtime.enabled:
        return ConnectorState.DISABLED
    if runtime.circuit_open:
        return ConnectorState.CIRCUIT_OPEN
    if runtime.rate_limited:
        return ConnectorState.RATE_LIMITED
    if runtime.consecutive_failures >= max(1, failure_threshold):
        return ConnectorState.FAILED
    if not runtime.has_run:
        return ConnectorState.IDLE
    if runtime.consecutive_failures > 0:
        return ConnectorState.DEGRADED
    return ConnectorState.ACTIVE


class ConnectorStatus(BaseModel):
    connector_id: str
    domain: str
    state: ConnectorState
    licence_or_usage_basis: str
    last_success_at: datetime | None = None
    consecutive_failures: int = 0
    records_ingested: int = 0
    records_deduplicated: int = 0
    last_error: str | None = None
    missing_configuration: list[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
