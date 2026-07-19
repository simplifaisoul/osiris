from __future__ import annotations

from datetime import datetime, timezone

from app.connectors.base import BaseConnector, RawObservation
from app.connectors.runner import ConnectorError, RateLimitError


class SyntheticSampleConnector(BaseConnector):
    """A demo connector that returns clearly-labelled synthetic observations.

    It reaches no external network, so it is safe in any profile (including
    SPYS_AIRGAP) and every record it produces is force-labelled SYNTHETIC by the
    base class. Use it to exercise the pipeline end to end without live data.
    """

    def __init__(self, manifest, *, records: int = 2) -> None:
        super().__init__(manifest, synthetic=True)
        self._records = records

    async def fetch(self, cursor: str | None) -> list[RawObservation]:
        base = datetime(2026, 7, 19, 12, 0, 0, tzinfo=timezone.utc)
        return [
            RawObservation(
                provider_id=f"synthetic-{i}",
                observed_at=base,
                raw_reference=f"synthetic://{self.manifest.id}/{i}",
                payload={"label": "SENTETİK", "index": i, "value": 40.0 + i},
                geometry={"type": "Point", "coordinates": [29.0 + i, 41.0 + i]},
                country="TR",
            )
            for i in range(self._records)
        ]


class FlakyConnector(BaseConnector):
    """A connector whose provider fails a fixed number of times, then recovers.

    Used to prove retry and circuit-breaker behaviour deterministically.
    """

    def __init__(self, manifest, *, fail_times: int, rate_limit_after: int | None = None) -> None:
        super().__init__(manifest, synthetic=True)
        self._fail_times = fail_times
        self._rate_limit_after = rate_limit_after
        self.calls = 0

    async def fetch(self, cursor: str | None) -> list[RawObservation]:
        self.calls += 1
        if self._rate_limit_after is not None and self.calls > self._rate_limit_after:
            raise RateLimitError("provider returned HTTP 429")
        if self.calls <= self._fail_times:
            raise ConnectorError(f"provider unavailable (call {self.calls})")
        return [
            RawObservation(
                provider_id="ok-1",
                observed_at=datetime(2026, 7, 19, 12, 0, 0, tzinfo=timezone.utc),
                raw_reference=f"synthetic://{self.manifest.id}/ok-1",
                payload={"recovered": True},
            )
        ]
