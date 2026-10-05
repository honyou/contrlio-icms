"""Persist organization policy documents and AI review reports."""

from alembic import op
import sqlalchemy as sa


revision = "20260930_0005"
down_revision = "20260930_0004"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()
    if "policy_documents" not in tables:
        op.create_table(
            "policy_documents",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("uploaded_by", sa.Uuid(), nullable=False),
            sa.Column("object_key", sa.String(length=500), nullable=False),
            sa.Column("file_name", sa.String(length=255), nullable=False),
            sa.Column("content_type", sa.String(length=160), nullable=False),
            sa.Column("size_bytes", sa.Integer(), nullable=False),
            sa.Column("sha256", sa.String(length=64), nullable=False),
            sa.Column("extracted_char_count", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("object_key"),
        )
        op.create_index("ix_policy_documents_organization_id", "policy_documents", ["organization_id"])

    if "policy_analyses" not in tables:
        op.create_table(
            "policy_analyses",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("document_id", sa.Uuid(), nullable=False),
            sa.Column("analyzed_by", sa.Uuid(), nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False),
            sa.Column("model", sa.String(length=160), nullable=False),
            sa.Column("token_usage", sa.Integer(), nullable=False),
            sa.Column("usage_estimated", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("result", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["document_id"], ["policy_documents.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["analyzed_by"], ["users.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_policy_analyses_organization_id", "policy_analyses", ["organization_id"])
        op.create_index("ix_policy_analyses_document_id", "policy_analyses", ["document_id"])
        op.create_index("ix_policy_analysis_org_document", "policy_analyses", ["organization_id", "document_id", "created_at"])


def downgrade() -> None:
    tables = _tables()
    if "policy_analyses" in tables:
        op.drop_table("policy_analyses")
    if "policy_documents" in tables:
        op.drop_table("policy_documents")
