"""Move open issues with an existing plan into the remediation workflow."""

from alembic import op
import sqlalchemy as sa


revision = "20261002_0013"
down_revision = "20261001_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        """
        UPDATE issues
        SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'open'
          AND EXISTS (
              SELECT 1
              FROM remediation_plans
              WHERE remediation_plans.issue_id = issues.id
                AND remediation_plans.organization_id = issues.organization_id
          )
        """
    ))


def downgrade() -> None:
    # The original status cannot be inferred safely after users continue work.
    pass
