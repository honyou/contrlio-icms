"""Allow remediation issues to originate from a risk and optional control."""

from alembic import op
import sqlalchemy as sa


revision = "20261001_0010"
down_revision = "20261001_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("issues") as batch:
        batch.alter_column("finding_id", existing_type=sa.Uuid(), nullable=True)
        batch.add_column(sa.Column("risk_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("control_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key("fk_issues_risk_id_risks", "risks", ["risk_id"], ["id"], ondelete="RESTRICT")
        batch.create_foreign_key("fk_issues_control_id_controls", "controls", ["control_id"], ["id"], ondelete="RESTRICT")
        batch.create_index("ix_issues_risk_id", ["risk_id"])
        batch.create_index("ix_issues_control_id", ["control_id"])
        batch.create_check_constraint(
            "ck_issue_source_finding_or_risk",
            "(finding_id IS NOT NULL AND risk_id IS NULL AND control_id IS NULL) OR (finding_id IS NULL AND risk_id IS NOT NULL)",
        )


def downgrade() -> None:
    bind = op.get_bind()
    risk_issues = bind.execute(sa.text("SELECT COUNT(*) FROM issues WHERE risk_id IS NOT NULL")).scalar_one()
    if risk_issues:
        raise RuntimeError("Cannot downgrade while risk-linked Issues exist; preserve their remediation history first.")
    with op.batch_alter_table("issues") as batch:
        batch.drop_constraint("ck_issue_source_finding_or_risk", type_="check")
        batch.drop_index("ix_issues_control_id")
        batch.drop_index("ix_issues_risk_id")
        batch.drop_constraint("fk_issues_control_id_controls", type_="foreignkey")
        batch.drop_constraint("fk_issues_risk_id_risks", type_="foreignkey")
        batch.drop_column("control_id")
        batch.drop_column("risk_id")
        batch.alter_column("finding_id", existing_type=sa.Uuid(), nullable=False)
