"""Add per-account permanent billing exemption."""

from alembic import op
import sqlalchemy as sa


revision = "20261001_0012"
down_revision = "20261001_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "is_billing_exempt" not in columns:
        op.add_column(
            "users",
            sa.Column("is_billing_exempt", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "is_billing_exempt" in columns:
        op.drop_column("users", "is_billing_exempt")
