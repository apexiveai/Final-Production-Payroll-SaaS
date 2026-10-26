"""add administrative location fields to sites

Revision ID: c814e376b9f0
Revises: 3a6f91c2d8e4
Create Date: 2026-10-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c814e376b9f0"
down_revision: Union[str, Sequence[str], None] = "3a6f91c2d8e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sites", sa.Column("region", sa.String(length=100), nullable=True))
    op.add_column("sites", sa.Column("district", sa.String(length=100), nullable=True))
    op.add_column("sites", sa.Column("township", sa.String(length=100), nullable=True))
    op.add_column(
        "sites", sa.Column("ward_village_tract", sa.String(length=150), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("sites", "ward_village_tract")
    op.drop_column("sites", "township")
    op.drop_column("sites", "district")
    op.drop_column("sites", "region")
