"""Add key-control metadata and process-scoped relationship links."""

from datetime import datetime, timezone
import uuid

from alembic import op
import sqlalchemy as sa


revision = "20261001_0009"
down_revision = "20261001_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("controls")}
    if "is_key_control" not in columns:
        op.add_column("controls", sa.Column("is_key_control", sa.Boolean(), nullable=False, server_default=sa.false()))

    tables = set(sa.inspect(bind).get_table_names())
    if "process_policy_links" not in tables:
        op.create_table(
            "process_policy_links",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("process_id", sa.Uuid(), nullable=False),
            sa.Column("policy_document_id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["process_id"], ["processes.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["policy_document_id"], ["policy_documents.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("organization_id", "process_id", "policy_document_id", name="uq_process_policy_link"),
        )
        op.create_index("ix_process_policy_links_organization_id", "process_policy_links", ["organization_id"])
        op.create_index("ix_process_policy_links_process_id", "process_policy_links", ["process_id"])
        op.create_index("ix_process_policy_links_policy_document_id", "process_policy_links", ["policy_document_id"])

    tables = set(sa.inspect(bind).get_table_names())
    if "risk_process_links" not in tables:
        op.create_table(
            "risk_process_links",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("risk_id", sa.Uuid(), nullable=False),
            sa.Column("process_id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["risk_id"], ["risks.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["process_id"], ["processes.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("organization_id", "risk_id", "process_id", name="uq_risk_process_link"),
        )
        op.create_index("ix_risk_process_links_organization_id", "risk_process_links", ["organization_id"])
        op.create_index("ix_risk_process_links_risk_id", "risk_process_links", ["risk_id"])
        op.create_index("ix_risk_process_links_process_id", "risk_process_links", ["process_id"])

    tables = set(sa.inspect(bind).get_table_names())
    if "risk_objective_links" not in tables:
        op.create_table(
            "risk_objective_links",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("risk_id", sa.Uuid(), nullable=False),
            sa.Column("objective_id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["risk_id"], ["risks.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["objective_id"], ["control_objectives.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("organization_id", "risk_id", "objective_id", name="uq_risk_objective_link"),
        )
        op.create_index("ix_risk_objective_links_organization_id", "risk_objective_links", ["organization_id"])
        op.create_index("ix_risk_objective_links_risk_id", "risk_objective_links", ["risk_id"])
        op.create_index("ix_risk_objective_links_objective_id", "risk_objective_links", ["objective_id"])

        existing_links = bind.execute(sa.text(
            "SELECT DISTINCT r.organization_id, r.id AS risk_id, o.id AS objective_id "
            "FROM rcms m "
            "JOIN risks r ON r.id = m.risk_id AND r.organization_id = m.organization_id "
            "JOIN controls c ON c.id = m.control_id AND c.organization_id = m.organization_id AND c.process_id = m.process_id "
            "JOIN control_objectives o ON o.id = c.objective_id AND o.organization_id = m.organization_id AND o.process_id = m.process_id"
        )).mappings().all()
        if existing_links:
            link_table = sa.Table("risk_objective_links", sa.MetaData(), autoload_with=bind)
            now = datetime.now(timezone.utc)
            bind.execute(link_table.insert(), [{
                "id": uuid.uuid4(), "organization_id": row["organization_id"],
                "risk_id": row["risk_id"], "objective_id": row["objective_id"],
                "created_at": now, "updated_at": now,
            } for row in existing_links])


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "process_policy_links" in tables:
        op.drop_index("ix_process_policy_links_policy_document_id", table_name="process_policy_links")
        op.drop_index("ix_process_policy_links_process_id", table_name="process_policy_links")
        op.drop_index("ix_process_policy_links_organization_id", table_name="process_policy_links")
        op.drop_table("process_policy_links")
    if "risk_process_links" in tables:
        op.drop_index("ix_risk_process_links_process_id", table_name="risk_process_links")
        op.drop_index("ix_risk_process_links_risk_id", table_name="risk_process_links")
        op.drop_index("ix_risk_process_links_organization_id", table_name="risk_process_links")
        op.drop_table("risk_process_links")
    if "risk_objective_links" in tables:
        op.drop_index("ix_risk_objective_links_objective_id", table_name="risk_objective_links")
        op.drop_index("ix_risk_objective_links_risk_id", table_name="risk_objective_links")
        op.drop_index("ix_risk_objective_links_organization_id", table_name="risk_objective_links")
        op.drop_table("risk_objective_links")
    columns = {column["name"] for column in sa.inspect(bind).get_columns("controls")}
    if "is_key_control" in columns:
        op.drop_column("controls", "is_key_control")
