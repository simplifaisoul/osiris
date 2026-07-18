"""Create KAM common object, SPYS planning, allocation, and audit tables.

Revision ID: 0001_foundation
Revises:
Create Date: 2026-07-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0001_foundation"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    plan_type = sa.Enum("HIP", "SHP", "OYTEP", name="plan_type")
    project_status = sa.Enum(
        "DRAFT", "REVIEW", "APPROVED", "REJECTED", "ARCHIVED", name="project_status"
    )
    plan_type.create(op.get_bind(), checkfirst=True)
    project_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "common_objects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("object_type", sa.String(64), nullable=False),
        sa.Column("source_id", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(64), nullable=False),
        sa.Column("collector_id", sa.String(255), nullable=False),
        sa.Column("source_reference", sa.Text(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("geometry", sa.JSON()),
        sa.Column("bounding_box", sa.JSON()),
        sa.Column("raw_object_uri", sa.Text(), nullable=False),
        sa.Column("normalized_payload", sa.JSON(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("language", sa.String(16)),
        sa.Column("country", sa.String(2)),
        sa.Column("classification", sa.String(32), nullable=False),
        sa.Column("handling_caveat", sa.String(255)),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("source_reliability", sa.Integer(), nullable=False),
        sa.Column("information_credibility", sa.Integer(), nullable=False),
        sa.Column("machine_confidence", sa.Numeric(5, 4)),
        sa.Column("analyst_confidence", sa.Numeric(5, 4)),
        sa.Column("licence_or_usage_basis", sa.Text(), nullable=False),
        sa.Column("retention_policy", sa.JSON(), nullable=False),
        sa.Column("processing_history", sa.JSON(), nullable=False),
        sa.Column("model_versions", sa.JSON(), nullable=False),
        sa.Column("correlation_ids", sa.JSON(), nullable=False),
        sa.Column("chain_of_custody", sa.JSON(), nullable=False),
        sa.Column("is_synthetic", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.CheckConstraint("source_reliability BETWEEN 1 AND 6", name="ck_object_reliability"),
        sa.CheckConstraint("information_credibility BETWEEN 1 AND 6", name="ck_object_credibility"),
        sa.CheckConstraint(
            "machine_confidence IS NULL OR machine_confidence BETWEEN 0 AND 1",
            name="ck_object_machine_confidence",
        ),
        sa.CheckConstraint(
            "analyst_confidence IS NULL OR analyst_confidence BETWEEN 0 AND 1",
            name="ck_object_analyst_confidence",
        ),
        sa.CheckConstraint(
            "(source_type = 'SYNTHETIC' AND is_synthetic) OR "
            "(source_type <> 'SYNTHETIC' AND NOT is_synthetic)",
            name="ck_object_synthetic_marking",
        ),
    )
    op.create_index("ix_common_objects_object_type", "common_objects", ["object_type"])
    op.create_index("ix_common_objects_source_id", "common_objects", ["source_id"])
    op.create_index("ix_common_objects_tenant_id", "common_objects", ["tenant_id"])

    op.create_table(
        "planning_projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("plan_type", plan_type, nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("serial_number", sa.String(64), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("need_authority", sa.String(200), nullable=False),
        sa.Column("justification", sa.Text(), nullable=False),
        sa.Column("tactical_requirements", sa.Text(), nullable=False),
        sa.Column("need_quantity", sa.Integer(), nullable=False),
        sa.Column("period_start", sa.Integer(), nullable=False),
        sa.Column("period_end", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("estimated_amount", sa.Numeric(20, 4), nullable=False),
        sa.Column("status", project_status, nullable=False, server_default="DRAFT"),
        sa.Column("created_by", sa.String(255), nullable=False),
        sa.Column("approved_by", sa.String(255)),
        sa.Column("is_synthetic", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", "code", "serial_number", name="uq_project_identity"),
        sa.CheckConstraint("need_quantity > 0", name="ck_project_positive_quantity"),
        sa.CheckConstraint("estimated_amount >= 0", name="ck_project_nonnegative_amount"),
        sa.CheckConstraint("currency IN ('TRY','USD','EUR')", name="ck_project_currency"),
        sa.CheckConstraint("period_end >= period_start", name="ck_project_period_order"),
        sa.CheckConstraint(
            "(plan_type <> 'SHP' OR period_end - period_start + 1 = 20) AND "
            "(plan_type <> 'OYTEP' OR period_end - period_start + 1 = 10)",
            name="ck_project_period_length",
        ),
    )
    op.create_index("ix_planning_projects_tenant_id", "planning_projects", ["tenant_id"])
    op.create_index("ix_planning_projects_plan_type", "planning_projects", ["plan_type"])

    op.create_table(
        "temporary_allocations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("allocation_type", sa.String(16), nullable=False),
        sa.Column("item_name", sa.String(300), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("stock_number", sa.String(128), nullable=False),
        sa.Column("issued_at", sa.Date(), nullable=False),
        sa.Column("due_at", sa.Date(), nullable=False),
        sa.Column("responsible_user_id", sa.String(255), nullable=False),
        sa.Column("extension_months", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_synthetic", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["project_id"], ["planning_projects.id"], ondelete="CASCADE"),
        sa.CheckConstraint("allocation_type IN ('TEMPORARY','GRANT')", name="ck_allocation_type"),
        sa.CheckConstraint("quantity > 0", name="ck_allocation_quantity"),
        sa.CheckConstraint("due_at >= issued_at", name="ck_allocation_dates"),
        sa.CheckConstraint("extension_months >= 0", name="ck_allocation_extension"),
    )
    op.create_index("ix_temporary_allocations_project_id", "temporary_allocations", ["project_id"])

    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sequence", sa.Integer(), nullable=False, unique=True),
        sa.Column("occurred_at_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone_name", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("ip_address", sa.String(64), nullable=False),
        sa.Column("device", sa.String(512), nullable=False),
        sa.Column("operation", sa.String(128), nullable=False),
        sa.Column("resource_type", sa.String(128), nullable=False),
        sa.Column("resource_id", sa.String(255)),
        sa.Column("result", sa.String(32), nullable=False),
        sa.Column("correlation_id", sa.String(64), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("previous_hash", sa.String(64), nullable=False),
        sa.Column("event_hash", sa.String(64), nullable=False, unique=True),
        sa.CheckConstraint("result IN ('SUCCESS','FAILURE','DENIED')", name="ck_audit_result"),
    )
    op.create_index("ix_audit_events_sequence", "audit_events", ["sequence"])
    op.create_index("ix_audit_events_user_id", "audit_events", ["user_id"])
    op.create_index("ix_audit_events_correlation_id", "audit_events", ["correlation_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_correlation_id", table_name="audit_events")
    op.drop_index("ix_audit_events_user_id", table_name="audit_events")
    op.drop_index("ix_audit_events_sequence", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_temporary_allocations_project_id", table_name="temporary_allocations")
    op.drop_table("temporary_allocations")
    op.drop_index("ix_planning_projects_plan_type", table_name="planning_projects")
    op.drop_index("ix_planning_projects_tenant_id", table_name="planning_projects")
    op.drop_table("planning_projects")
    op.drop_index("ix_common_objects_tenant_id", table_name="common_objects")
    op.drop_index("ix_common_objects_source_id", table_name="common_objects")
    op.drop_index("ix_common_objects_object_type", table_name="common_objects")
    op.drop_table("common_objects")
    sa.Enum("DRAFT", "REVIEW", "APPROVED", "REJECTED", "ARCHIVED", name="project_status").drop(
        op.get_bind(), checkfirst=True
    )
    sa.Enum("HIP", "SHP", "OYTEP", name="plan_type").drop(op.get_bind(), checkfirst=True)
