from __future__ import annotations

import hashlib
import json
from typing import Any


def content_hash(source_id: str, payload: dict[str, Any]) -> str:
    """Deterministic SHA-256 of a source id plus its canonical JSON payload.

    Keys are sorted and separators fixed so semantically identical payloads hash
    identically regardless of field order or incidental whitespace.
    """
    canonical = json.dumps(
        {"source_id": source_id, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class DedupStore:
    """In-memory idempotency guard keyed by content hash.

    Returns True the first time a hash is seen and False on every repeat, so a
    replayed source record produces exactly one downstream observation. A
    production deployment swaps this for the Postgres/Redis-backed store behind
    the same interface; the connector code does not change.
    """

    def __init__(self) -> None:
        self._seen: set[str] = set()

    def is_new(self, digest: str) -> bool:
        if digest in self._seen:
            return False
        self._seen.add(digest)
        return True

    def __contains__(self, digest: str) -> bool:
        return digest in self._seen

    def __len__(self) -> int:
        return len(self._seen)
