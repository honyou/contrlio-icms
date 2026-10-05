"""Store encrypted, organization-scoped AI provider credentials."""

from alembic import op
import sqlalchemy as sa

revision = "20260930_0002"
down_revision = "20260930_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The initial local schema migration uses Base.metadata.create_all, so a
    # fresh install may already contain this later-added table.
    if "ai_provider_configs" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "ai_provider_configs",
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False),
            sa.Column("protocol", sa.String(length=40), nullable=False),
            sa.Column("base_url", sa.String(length=500), nullable=False),
            sa.Column("model", sa.String(length=160), nullable=False),
            sa.Column("encrypted_api_key", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("organization_id"),
        )


def downgrade() -> None:
    if "ai_provider_configs" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("ai_provider_configs")
