"""align employee account uniqueness with ORM metadata

Revision ID: 9d31fe52a4c8
Revises: 4a7c2d91e6b3
Create Date: 2026-10-23
"""
from typing import Sequence, Union

from alembic import op


revision: str = "9d31fe52a4c8"
down_revision: Union[str, Sequence[str], None] = "4a7c2d91e6b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("employees_user_id_key", "employees", type_="unique")
    op.drop_index("ix_employees_user_id", table_name="employees")
    op.create_index(
        "ix_employees_user_id", "employees", ["user_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_employees_user_id", table_name="employees")
    op.create_index(
        "ix_employees_user_id", "employees", ["user_id"], unique=False
    )
    op.create_unique_constraint(None, "employees", ["user_id"])
