from __future__ import annotations

from app.connectors.circuit_breaker import BreakerState, CircuitBreaker


def test_breaker_trips_after_threshold() -> None:
    cb = CircuitBreaker(failure_threshold=3, reset_timeout_seconds=30)
    assert cb.allows(now=0.0)
    cb.record_failure(now=0.0)
    cb.record_failure(now=1.0)
    assert cb.state is BreakerState.CLOSED
    cb.record_failure(now=2.0)
    assert cb.state is BreakerState.OPEN
    assert not cb.allows(now=2.0)


def test_breaker_half_opens_after_reset_window() -> None:
    cb = CircuitBreaker(failure_threshold=1, reset_timeout_seconds=30)
    cb.record_failure(now=0.0)
    assert cb.is_open
    assert not cb.allows(now=10.0)          # still within the reset window
    assert cb.allows(now=30.0)              # window elapsed -> trial call permitted
    assert cb.state is BreakerState.HALF_OPEN


def test_success_closes_breaker() -> None:
    cb = CircuitBreaker(failure_threshold=1, reset_timeout_seconds=30)
    cb.record_failure(now=0.0)
    cb.allows(now=30.0)                      # -> HALF_OPEN
    cb.record_success()
    assert cb.state is BreakerState.CLOSED
    assert cb.allows(now=31.0)


def test_failure_while_half_open_reopens() -> None:
    cb = CircuitBreaker(failure_threshold=1, reset_timeout_seconds=30)
    cb.record_failure(now=0.0)
    cb.allows(now=30.0)                      # -> HALF_OPEN
    cb.record_failure(now=31.0)             # trial fails -> reopen
    assert cb.is_open
    assert not cb.allows(now=40.0)
