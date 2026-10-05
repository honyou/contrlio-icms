"""Persist risk categories, verification guidance and baseline provenance."""

from alembic import op
import sqlalchemy as sa


revision = "20261001_0007"
down_revision = "20260930_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("risks")}
    additions = [
        sa.Column("category", sa.String(80), nullable=False, server_default="业务运营"),
        sa.Column("verification_methods", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("evidence_requirements", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("sample_guidance", sa.Text(), nullable=False, server_default=""),
        sa.Column("verification_frequency", sa.String(24), nullable=False, server_default="monthly"),
        sa.Column("owner_role", sa.String(160), nullable=False, server_default=""),
        sa.Column("template_key", sa.String(180), nullable=True),
        sa.Column("template_version", sa.String(40), nullable=True),
    ]
    constraints = {item["name"] for item in sa.inspect(op.get_bind()).get_unique_constraints("risks")}
    with op.batch_alter_table("risks") as batch:
        for column in additions:
            if column.name not in columns:
                batch.add_column(column)
        if "uq_risk_process_template" not in constraints:
            batch.create_unique_constraint("uq_risk_process_template", ["organization_id", "process_id", "template_key"])


def downgrade() -> None:
    with op.batch_alter_table("risks") as batch:
        batch.drop_constraint("uq_risk_process_template", type_="unique")
        for name in ("template_version", "template_key", "owner_role", "verification_frequency", "sample_guidance", "evidence_requirements", "verification_methods", "category"):
            batch.drop_column(name)
