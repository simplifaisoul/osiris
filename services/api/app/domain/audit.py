from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import AuditEventRecord


GENESIS_HASH = "0" * 64


def calculate_event_hash(key: bytes, previous_hash: str, payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hmac.new(key, f"{previous_hash}:{canonical}".encode(), hashlib.sha256).hexdigest()


def audit_payload(record: AuditEventRecord) -> dict[str, Any]:
    return {
        "sequence": record.sequence,
        "occurred_at_utc": record.occurred_at_utc.isoformat(),
        "timezone_name": record.timezone_name,
        "user_id": record.user_id,
        "ip_address": record.ip_address,
        "device": record.device,
        "operation": record.operation,
        "resource_type": record.resource_type,
        "resource_id": record.resource_id,
        "result": record.result,
        "correlation_id": record.correlation_id,
        "details": record.details,
    }


async def append_audit_event(
    session: AsyncSession,
    *,
    key: bytes,
    timezone_name: str,
    user_id: str,
    ip_address: str,
    device: str,
    operation: str,
    resource_type: str,
    resource_id: str | None,
    result: str,
    correlation_id: str,
    details: dict[str, Any] | None = None,
) -> AuditEventRecord:
    # PostgreSQL advisory lock serializes writers so the hash chain cannot fork.
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        await session.execute(text("SELECT pg_advisory_xact_lock(7042561901)"))
    last = (
        await session.execute(select(AuditEventRecord).order_by(AuditEventRecord.sequence.desc()).limit(1))
    ).scalar_one_or_none()
    record = AuditEventRecord(
        sequence=(last.sequence + 1) if last else 1,
        occurred_at_utc=datetime.now(timezone.utc),
        timezone_name=timezone_name,
        user_id=user_id,
        ip_address=ip_address,
        device=device,
        operation=operation,
        resource_type=resource_type,
        resource_id=resource_id,
        result=result,
        correlation_id=correlation_id,
        details=details or {},
        previous_hash=last.event_hash if last else GENESIS_HASH,
        event_hash="",
    )
    record.event_hash = calculate_event_hash(key, record.previous_hash, audit_payload(record))
    session.add(record)
    await session.flush()
    return record


def verify_audit_chain(records: Iterable[AuditEventRecord], key: bytes) -> bool:
    previous = GENESIS_HASH
    expected_sequence = 1
    for record in records:
        if record.sequence != expected_sequence or record.previous_hash != previous:
            return False
        expected = calculate_event_hash(key, previous, audit_payload(record))
        if not hmac.compare_digest(expected, record.event_hash):
            return False
        previous = record.event_hash
        expected_sequence += 1
    return True

