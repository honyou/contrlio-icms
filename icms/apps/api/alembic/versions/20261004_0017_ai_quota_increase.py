"""Increase member AI allowance and set the database default."""

from alembic import op
import sqlalchemy as sa


revision = "20261004_0017"
down_revision = "20261004_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "UPDATE ai_user_quotas "
        "SET monthly_limit_tokens = 2000000 "
        "WHERE user_id IN (SELECT id FROM users WHERE is_system_admin = false)"
    ))
    op.alter_column(
        "ai_user_quotas",
        "monthly_limit_tokens",
        existing_type=sa.Integer(),
        existing_nullable=False,
        server_default="2000000",
    )


def downgrade() -> None:
    # Do not rewrite member-specific quota values on downgrade: once the new
    # limit is in use, restoring all rows would erase later admin adjustments.
    op.alter_column(
        "ai_user_quotas",
        "monthly_limit_tokens",
        existing_type=sa.Integer(),
        existing_nullable=False,
        server_default="20000",
    )
