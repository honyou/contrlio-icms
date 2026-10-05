"""Track per-member AI token quotas, usage, and extra-quota requests."""

from alembic import op
import sqlalchemy as sa

revision = "20260930_0004"
down_revision = "20260930_0003"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()
    if "ai_user_quotas" not in tables:
        op.create_table(
            "ai_user_quotas",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("monthly_limit_tokens", sa.Integer(), nullable=False, server_default="20000"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("organization_id", "user_id", name="uq_ai_quota_org_user"),
        )
        op.create_index("ix_ai_user_quotas_organization_id", "ai_user_quotas", ["organization_id"])
        op.create_index("ix_ai_user_quotas_user_id", "ai_user_quotas", ["user_id"])

    if "ai_token_usages" not in tables:
        op.create_table(
            "ai_token_usages",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("period_start", sa.Date(), nullable=False),
            sa.Column("task", sa.String(length=40), nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False),
            sa.Column("model", sa.String(length=160), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("reserved_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("usage_estimated", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_ai_token_usages_organization_id", "ai_token_usages", ["organization_id"])
        op.create_index("ix_ai_token_usages_user_id", "ai_token_usages", ["user_id"])
        op.create_index("ix_ai_usage_org_user_period", "ai_token_usages", ["organization_id", "user_id", "period_start"])

    if "ai_quota_requests" not in tables:
        op.create_table(
            "ai_quota_requests",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("period_start", sa.Date(), nullable=False),
            sa.Column("requested_tokens", sa.Integer(), nullable=False),
            sa.Column("approved_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("reviewed_by", sa.Uuid(), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("review_note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_ai_quota_requests_organization_id", "ai_quota_requests", ["organization_id"])
        op.create_index("ix_ai_quota_requests_user_id", "ai_quota_requests", ["user_id"])
        op.create_index("ix_ai_quota_request_org_period_status", "ai_quota_requests", ["organization_id", "period_start", "status"])


def downgrade() -> None:
    tables = _tables()
    if "ai_quota_requests" in tables:
        op.drop_table("ai_quota_requests")
    if "ai_token_usages" in tables:
        op.drop_table("ai_token_usages")
    if "ai_user_quotas" in tables:
        op.drop_table("ai_user_quotas")
