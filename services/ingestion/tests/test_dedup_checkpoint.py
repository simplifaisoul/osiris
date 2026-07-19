from __future__ import annotations

import pytest

from app.connectors.checkpoint import InMemoryCheckpointStore
from app.connectors.dedup import DedupStore, content_hash


def test_content_hash_is_order_independent() -> None:
    a = content_hash("src-1", {"b": 2, "a": 1})
    b = content_hash("src-1", {"a": 1, "b": 2})
    assert a == b
    assert len(a) == 64


def test_content_hash_changes_with_payload() -> None:
    a = content_hash("src-1", {"a": 1})
    b = content_hash("src-1", {"a": 2})
    assert a != b


def test_dedup_returns_true_once() -> None:
    store = DedupStore()
    digest = content_hash("src-1", {"a": 1})
    assert store.is_new(digest) is True
    assert store.is_new(digest) is False   # replay is suppressed
    assert len(store) == 1


def test_checkpoint_set_and_get() -> None:
    store = InMemoryCheckpointStore()
    assert store.get("opensky") is None
    store.set("opensky", "2026-07-19T12:00:00Z")
    assert store.get("opensky") == "2026-07-19T12:00:00Z"


def test_checkpoint_rejects_empty_id() -> None:
    store = InMemoryCheckpointStore()
    with pytest.raises(ValueError):
        store.set("", "cursor")
