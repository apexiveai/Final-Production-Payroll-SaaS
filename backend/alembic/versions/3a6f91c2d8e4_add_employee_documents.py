"""add private employee document metadata

Revision ID: 3a6f91c2d8e4
Revises: 7c4e1a8b2f60
Create Date: 2026-10-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3a6f91c2d8e4"
down_revision: Union[str, Sequence[str], None] = "7c4e1a8b2f60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "employee_documents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("employee_id", sa.UUID(), nullable=False),
        sa.Column("uploaded_by_user_id", sa.UUID(), nullable=True),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("original_filename", sa.String(length=180), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["employee_id"],
            ["employees.id"],
            name="fk_employee_documents_employee_id_employees",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_user_id"],
            ["users.id"],
            name="fk_employee_documents_uploaded_by_user_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_employee_documents"),
        sa.UniqueConstraint("object_key", name="uq_employee_documents_object_key"),
    )
    op.create_index(
        "ix_employee_documents_employee_id",
        "employee_documents",
        ["employee_id"],
    )
    op.create_index(
        "ix_employee_documents_uploaded_by_user_id",
        "employee_documents",
        ["uploaded_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_employee_documents_uploaded_by_user_id",
        table_name="employee_documents",
    )
    op.drop_index(
        "ix_employee_documents_employee_id",
        table_name="employee_documents",
    )
    op.drop_table("employee_documents")
