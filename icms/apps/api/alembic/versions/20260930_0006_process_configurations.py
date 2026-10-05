"""Persist editable process workflows and immutable published versions."""

from alembic import op
import sqlalchemy as sa


revision = "20260930_0006"
down_revision = "20260930_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "process_configurations" not in tables:
        op.create_table(
            "process_configurations",
            sa.Column("process_id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("config", sa.JSON(), nullable=False),
            sa.Column("published_revision", sa.Integer(), nullable=True),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["process_id"], ["processes.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("process_id"),
            sa.CheckConstraint("revision >= 0", name="ck_process_config_revision"),
        )
        op.create_index("ix_process_configurations_organization_id", "process_configurations", ["organization_id"])
    if "process_configuration_versions" not in tables:
        op.create_table(
            "process_configuration_versions",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("process_id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("config", sa.JSON(), nullable=False),
            sa.Column("published_by", sa.Uuid(), nullable=False),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["process_id"], ["processes.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["published_by"], ["users.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("process_id", "revision", name="uq_process_config_version"),
            sa.CheckConstraint("revision >= 1", name="ck_process_config_version_revision"),
        )
        op.create_index("ix_process_configuration_versions_organization_id", "process_configuration_versions", ["organization_id"])
        op.create_index("ix_process_configuration_versions_process_id", "process_configuration_versions", ["process_id"])
        op.create_index("ix_process_config_version_history", "process_configuration_versions", ["organization_id", "process_id", "revision"])


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "process_configuration_versions" in tables:
        op.drop_table("process_configuration_versions")
    if "process_configurations" in tables:
        op.drop_table("process_configurations")
