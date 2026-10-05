"""Add trial entitlement and payment order records."""

from alembic import op
import sqlalchemy as sa


revision = "20261001_0011"
down_revision = "20261001_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "trial_started_at" not in user_columns:
        op.add_column("users", sa.Column("trial_started_at", sa.DateTime(timezone=True), nullable=True))
    if "paid_through" not in user_columns:
        op.add_column("users", sa.Column("paid_through", sa.DateTime(timezone=True), nullable=True))

    if "payment_orders" not in inspector.get_table_names():
        op.create_table(
            "payment_orders",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("out_trade_no", sa.String(length=64), nullable=False),
            sa.Column("alipay_trade_no", sa.String(length=96), nullable=True),
            sa.Column("amount_fen", sa.Integer(), nullable=False),
            sa.Column("provider", sa.String(length=24), nullable=False, server_default="alipay_qr"),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("entitlement_until", sa.DateTime(timezone=True), nullable=True),
            sa.Column("approved_by", sa.Uuid(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint("amount_fen > 0", name="ck_payment_order_amount_positive"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["approved_by"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("out_trade_no"),
            sa.UniqueConstraint("alipay_trade_no"),
        )
        op.create_index("ix_payment_order_user_status", "payment_orders", ["user_id", "status"])
        op.create_index("ix_payment_orders_user_id", "payment_orders", ["user_id"])
        op.create_index("ix_payment_orders_out_trade_no", "payment_orders", ["out_trade_no"])
    else:
        payment_columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("payment_orders")}
        if "provider" not in payment_columns:
            op.add_column("payment_orders", sa.Column("provider", sa.String(length=24), nullable=False, server_default="alipay_qr"))
        if "approved_by" not in payment_columns:
            op.add_column("payment_orders", sa.Column("approved_by", sa.Uuid(), nullable=True))
            op.create_foreign_key("fk_payment_orders_approved_by_users", "payment_orders", "users", ["approved_by"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    if "payment_orders" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("payment_orders")
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "paid_through" in columns:
        op.drop_column("users", "paid_through")
    if "trial_started_at" in columns:
        op.drop_column("users", "trial_started_at")
