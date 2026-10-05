"""Persist cross-policy and workflow analysis reports."""

from alembic import op
import sqlalchemy as sa


revision = "20261004_0016"
down_revision = "20261004_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "policy_cross_analyses" in tables:
        return
    op.create_table(
        "policy_cross_analyses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("analyzed_by", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("model", sa.String(length=160), nullable=False),
        sa.Column("token_usage", sa.Integer(), nullable=False),
        sa.Column("usage_estimated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("input_char_count", sa.Integer(), nullable=False),
        sa.Column("policy_document_ids", sa.JSON(), nullable=False),
        sa.Column("process_ids", sa.JSON(), nullable=False),
        sa.Column("source_snapshot", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["analyzed_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_policy_cross_analyses_organization_id", "policy_cross_analyses", ["organization_id"])
    op.create_index("ix_policy_cross_analysis_org_created", "policy_cross_analyses", ["organization_id", "created_at"])


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "policy_cross_analyses" in tables:
        op.drop_table("policy_cross_analyses")
