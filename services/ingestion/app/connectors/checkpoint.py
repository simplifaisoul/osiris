from __future__ import annotations

from typing import Protocol


class CheckpointStore(Protocol):
    """Persist the last-processed cursor per connector for resumable ingestion."""

    def get(self, connector_id: str) -> str | None: ...

    def set(self, connector_id: str, cursor: str) -> None: ...


class InMemoryCheckpointStore:
    """Non-durable checkpoint store for tests and single-process runs.

    A production deployment substitutes a Postgres-backed store implementing the
    same :class:`CheckpointStore` protocol; the connector runner is agnostic.
    """

    def __init__(self) -> None:
        self._cursors: dict[str, str] = {}

    def get(self, connector_id: str) -> str | None:
        return self._cursors.get(connector_id)

    def set(self, connector_id: str, cursor: str) -> None:
        if not connector_id:
            raise ValueError("connector_id must be non-empty")
        self._cursors[connector_id] = cursor
