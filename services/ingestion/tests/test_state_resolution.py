from __future__ import annotations

from datetime import datetime, timezone

from app.connectors.state import ConnectorRuntime, ConnectorState, resolve_state

NOW = datetime(2026, 7, 19, 12, 0, 0, tzinfo=timezone.utc)


def test_unconfigured_is_configuration_required() -> None:
    rt = ConnectorRuntime(configured=False, enabled=True)
    assert resolve_state(rt, failure_threshold=5) == ConnectorState.CONFIGURATION_REQUIRED


def test_configuration_required_wins_over_health() -> None:
    # Even with a recent success, a connector that lost its secret is not ACTIVE.
    rt = ConnectorRuntime(configured=False, enabled=True, has_run=True, last_success_at=NOW)
    assert resolve_state(rt, failure_threshold=5) == ConnectorState.CONFIGURATION_REQUIRED


def test_disabled_reported_when_configured_but_off() -> None:
    rt = ConnectorRuntime(configured=True, enabled=False)
    assert resolve_state(rt, failure_threshold=5) == ConnectorState.DISABLED


def test_circuit_open_precedes_failure_count() -> None:
    rt = ConnectorRuntime(configured=True, enabled=True, circuit_open=True, consecutive_failures=99)
    assert resolve_state(rt, failure_threshold=5) == ConnectorState.CIRCUIT_OPEN


def test_rate_limited_state() -> None:
    rt = ConnectorRuntime(configured=True, enabled=True, rate_limited=True)
    assert resolve_state(rt, failure_threshold=5) == ConnectorState.RATE_LIMITED


def test_failed_after_threshold() -> None:
    rt = ConnectorRuntime(configured=True, enabled=True, has_run=True, consecutive_failures=5)
    assert resolve_state(rt, failure_threshold=5) == ConnectorState.FAILED


def test_idle_before_first_run() -> None:
    rt = ConnectorRuntime(configured=True, enabled=True, has_run=False)
    assert resolve_state(rt, failure_threshold=5) == ConnectorState.IDLE


def test_degraded_with_some_failures() -> None:
    rt = ConnectorRuntime(configured=True, enabled=True, has_run=True, consecutive_failures=2)
    assert resolve_state(rt, failure_threshold=5) == ConnectorState.DEGRADED


def test_active_when_healthy() -> None:
    rt = ConnectorRuntime(
        configured=True, enabled=True, has_run=True, consecutive_failures=0, last_success_at=NOW
    )
    assert resolve_state(rt, failure_threshold=5) == ConnectorState.ACTIVE
