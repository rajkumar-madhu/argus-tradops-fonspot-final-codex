"""tenants and tenant grants

Revision ID: 20260913_0003
Revises: 20260912_0002
Create Date: 2026-09-13

Multi-tenancy (app/tenancy.py). Tables stay empty until TRADEOPS_MULTI_TENANT is
enabled, so applying this migration changes nothing for a single-tenant deployment.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260913_0003"
down_revision: Union[str, None] = "20260912_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.String(63), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("es_url", sa.String(512), nullable=True),
        sa.Column("es_verify_certs", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("credentials_ref", sa.String(63), nullable=True),
        sa.Column("journal_path", sa.String(512), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_tenants_enabled", "tenants", ["enabled"])
    op.create_table(
        "tenant_grants",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.String(63), nullable=False),
        sa.Column("principal", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "principal", name="uq_tenant_grant"),
    )
    op.create_index("ix_tenant_grants_tenant_id", "tenant_grants", ["tenant_id"])
    op.create_index("ix_tenant_grants_principal", "tenant_grants", ["principal"])


def downgrade() -> None:
    op.drop_index("ix_tenant_grants_principal", table_name="tenant_grants")
    op.drop_index("ix_tenant_grants_tenant_id", table_name="tenant_grants")
    op.drop_table("tenant_grants")
    op.drop_index("ix_tenants_enabled", table_name="tenants")
    op.drop_table("tenants")
