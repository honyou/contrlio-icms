"""Add system-admin-managed single-use registration invitations."""

from alembic import op
import sqlalchemy as sa


revision = "20261004_0014"
down_revision = "20261002_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "registration_invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["used_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code_hash", name="uq_registration_invitation_code_hash"),
    )
    op.create_index(
        "ix_registration_invitation_created_at",
        "registration_invitations",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_registration_invitation_created_at", table_name="registration_invitations")
    op.drop_table("registration_invitations")
