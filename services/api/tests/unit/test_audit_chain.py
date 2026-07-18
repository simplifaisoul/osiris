from __future__ import annotations

from datetime import datetime, timezone

from app.domain.audit import GENESIS_HASH, audit_payload, calculate_event_hash, verify_audit_chain
from app.domain.models import AuditEventRecord


KEY = b"foundation-test-audit-key-32-bytes-minimum"


def event(sequence: int, previous_hash: str) -> AuditEventRecord:
    record = AuditEventRecord(
        id=f"event-{sequence}",
        sequence=sequence,
        occurred_at_utc=datetime(2026, 7, 18, sequence, tzinfo=timezone.utc),
        timezone_name="Europe/Istanbul",
        user_id="synthetic-user",
        ip_address="127.0.0.1",
        device="synthetic-device",
        operation="test.operation",
        resource_type="Synthetic",
        resource_id=str(sequence),
        result="SUCCESS",
        correlation_id=f"corr-{sequence}",
        details={"synthetic": True},
        previous_hash=previous_hash,
        event_hash="",
    )
    record.event_hash = calculate_event_hash(KEY, previous_hash, audit_payload(record))
    return record


def test_hash_chain_verifies_and_detects_tampering() -> None:
    first = event(1, GENESIS_HASH)
    second = event(2, first.event_hash)
    assert verify_audit_chain([first, second], KEY)
    second.details = {"synthetic": False}
    assert not verify_audit_chain([first, second], KEY)

