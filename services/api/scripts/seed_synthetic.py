from __future__ import annotations

import asyncio
import hashlib
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session_factory
from app.domain.models import CommonObjectRecord, PlanType, PlanningProjectRecord


async def seed(session: AsyncSession) -> None:
    synthetic_payload = {
        "label": "SENTETİK - eğitim amaçlı gözlem",
        "description": "Gerçek kişi, kurum, tesis veya operasyon içermez.",
    }
    content_hash = hashlib.sha256(repr(sorted(synthetic_payload.items())).encode()).hexdigest()
    now = datetime.now(timezone.utc)
    session.add(
        CommonObjectRecord(
            object_type="Observation",
            source_id="synthetic-foundation-seed",
            source_type="SYNTHETIC",
            collector_id="synthetic-seed-script",
            source_reference="urn:kam:synthetic:foundation-observation",
            observed_at=now,
            published_at=now,
            raw_object_uri="s3://synthetic-only/foundation/observation.json",
            normalized_payload=synthetic_payload,
            content_hash=content_hash,
            language="tr",
            country="TR",
            classification="UNCLASSIFIED",
            tenant_id="synthetic-tenant",
            source_reliability=6,
            information_credibility=6,
            machine_confidence=Decimal("1.0000"),
            licence_or_usage_basis="SYNTHETIC_TEST_DATA",
            retention_policy={"policy": "training", "days": 30},
            processing_history=[{"step": "synthetic_seed", "at": now.isoformat()}],
            model_versions=[],
            correlation_ids=["synthetic-foundation"],
            chain_of_custody=[{"action": "created", "actor": "synthetic-seed-script"}],
            is_synthetic=True,
        )
    )
    session.add(
        PlanningProjectRecord(
            tenant_id="synthetic-tenant",
            plan_type=PlanType.HIP,
            code="SYN.HIP.001",
            serial_number="SYN-0001",
            title="SENTETİK HİP Eğitim Projesi",
            need_authority="SENTETİK İHTİYAÇ MAKAMI",
            justification="Yalnızca Poka-Yoke ve iş akışı kabul testleri için sentetik gerekçe.",
            tactical_requirements="Gerçek harekât isterleri içermez; yalnız sentetik test metnidir.",
            need_quantity=1,
            period_start=2026,
            period_end=2026,
            currency="TRY",
            estimated_amount=Decimal("1000.0000"),
            created_by="synthetic-seed-script",
            is_synthetic=True,
        )
    )
    await session.commit()


async def main() -> None:
    async with get_session_factory()() as session:
        await seed(session)


if __name__ == "__main__":
    asyncio.run(main())
