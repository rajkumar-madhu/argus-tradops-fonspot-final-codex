"""indexes for incident and RCA list ordering

Revision ID: 20260912_0002
Revises: 20260907_0001
Create Date: 2026-09-12

list_incidents sorts by last_seen and list_rca by updated_at; neither column
was indexed, so both were a full scan plus sort.
"""
from typing import Sequence, Union
from alembic import op

revision: str = "20260912_0002"
down_revision: Union[str, None] = "20260907_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_incidents_last_seen", "incidents", ["last_seen"])
    op.create_index("ix_incidents_status_last_seen", "incidents", ["status", "last_seen"])
    op.create_index("ix_rca_cases_updated_at", "rca_cases", ["updated_at"])


def downgrade() -> None:
    op.drop_index("ix_rca_cases_updated_at", table_name="rca_cases")
    op.drop_index("ix_incidents_status_last_seen", table_name="incidents")
    op.drop_index("ix_incidents_last_seen", table_name="incidents")
