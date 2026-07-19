from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class BreakerState(str, Enum):
    CLOSED = "CLOSED"        # calls flow normally
    OPEN = "OPEN"            # calls are short-circuited (suspended)
    HALF_OPEN = "HALF_OPEN"  # one trial call allowed to test recovery


@dataclass
class CircuitBreaker:
    """A three-state circuit breaker guarding a single connector's provider.

    The breaker is time-driven but clock-injected: callers pass ``now`` so the
    behaviour is fully deterministic under test and identical in production.
    """

    failure_threshold: int
    reset_timeout_seconds: float
    _failures: int = 0
    _opened_at: float | None = None
    _state: BreakerState = BreakerState.CLOSED

    @property
    def state(self) -> BreakerState:
        return self._state

    @property
    def is_open(self) -> bool:
        return self._state is BreakerState.OPEN

    def allows(self, now: float) -> bool:
        """Return True if a call may proceed at time ``now``.

        Moves an OPEN breaker to HALF_OPEN once the reset window has elapsed so a
        single trial call can probe recovery.
        """
        if self._state is BreakerState.OPEN:
            assert self._opened_at is not None
            if now - self._opened_at >= self.reset_timeout_seconds:
                self._state = BreakerState.HALF_OPEN
                return True
            return False
        return True

    def record_success(self) -> None:
        self._failures = 0
        self._opened_at = None
        self._state = BreakerState.CLOSED

    def record_failure(self, now: float) -> None:
        # A failure while probing recovery re-opens immediately.
        if self._state is BreakerState.HALF_OPEN:
            self._trip(now)
            return
        self._failures += 1
        if self._failures >= max(1, self.failure_threshold):
            self._trip(now)

    def _trip(self, now: float) -> None:
        self._state = BreakerState.OPEN
        self._opened_at = now
