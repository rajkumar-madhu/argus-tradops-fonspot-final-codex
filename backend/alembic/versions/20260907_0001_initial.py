"""initial incident and RCA tables

Revision ID: 20260907_0001
Revises:
Create Date: 2026-09-07
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260907_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        "incidents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("fingerprint", sa.String(255), nullable=False),
        sa.Column("incident_key", sa.String(255), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False, server_default="P3"),
        sa.Column("incident_type", sa.String(64), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="OPEN"),
        sa.Column("occurrence_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("source", sa.String(64), nullable=False, server_default="event-bus"),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("fingerprint", name="uq_incident_fingerprint"),
    )
    for col in ("fingerprint", "incident_key", "incident_type", "status"):
        op.create_index(f"ix_incidents_{col}", "incidents", [col])

    op.create_table(
        "rca_cases",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("order_id", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="OPEN"),
        sa.Column("category", sa.String(128), nullable=True),
        sa.Column("code", sa.String(128), nullable=True),
        sa.Column("probable_cause", sa.Text(), nullable=True),
        sa.Column("confidence_bp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("correlation", sa.JSON(), nullable=False),
        sa.Column("source", sa.String(64), nullable=False, server_default="noren-correlation"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("order_id", name="uq_rca_order_id"),
    )
    op.create_index("ix_rca_cases_order_id", "rca_cases", ["order_id"])
    op.create_index("ix_rca_cases_status", "rca_cases", ["status"])

def downgrade() -> None:
    op.drop_table("rca_cases")
    op.drop_table("incidents")
