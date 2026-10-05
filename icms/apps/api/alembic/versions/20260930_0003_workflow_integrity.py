"""Preserve auth revocation and immutable remediation plan snapshots."""

from alembic import op
import sqlalchemy as sa

revision = "20260930_0003"
down_revision = "20260930_0002"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "auth_version" not in _columns("users"):
        op.add_column("users", sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"))
    submission_columns = _columns("remediation_submissions")
    if "root_cause_snapshot" not in submission_columns:
        op.add_column("remediation_submissions", sa.Column("root_cause_snapshot", sa.Text(), nullable=True))
    if "action_plan_snapshot" not in submission_columns:
        op.add_column("remediation_submissions", sa.Column("action_plan_snapshot", sa.Text(), nullable=True))
    if "due_date_snapshot" not in submission_columns:
        op.add_column("remediation_submissions", sa.Column("due_date_snapshot", sa.Date(), nullable=True))

    # Existing submissions predate these snapshots. Leave their snapshot fields
    # null rather than copying the current plan into historical records.


def downgrade() -> None:
    submission_columns = _columns("remediation_submissions")
    for name in ("due_date_snapshot", "action_plan_snapshot", "root_cause_snapshot"):
        if name in submission_columns:
            op.drop_column("remediation_submissions", name)
    if "auth_version" in _columns("users"):
        op.drop_column("users", "auth_version")
