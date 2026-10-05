"""Archive risks without breaking inspection history."""

from alembic import op
import sqlalchemy as sa


revision = "20261001_0008"
down_revision = "20261001_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("risks")}
    if "archived_at" not in columns:
        op.add_column("risks", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("risks")}
    if "archived_at" in columns:
        op.drop_column("risks", "archived_at")
