"""Store an encrypted copy of invitations for system-admin retrieval."""

from alembic import op
import sqlalchemy as sa


revision = "20261004_0015"
down_revision = "20261004_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "registration_invitations",
        sa.Column("code_ciphertext", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("registration_invitations", "code_ciphertext")
