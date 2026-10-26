"""add site to users

Revision ID: 7c4e1a8b2f60
Revises: 9d31fe52a4c8
Create Date: 2026-10-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c4e1a8b2f60'
down_revision: Union[str, Sequence[str], None] = '9d31fe52a4c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add an optional site assignment to users."""
    op.add_column(
        'users',
        sa.Column('site_id', sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        'fk_users_site_id_sites',
        'users',
        'sites',
        ['site_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_users_site_id', 'users', ['site_id'], unique=False)


def downgrade() -> None:
    """Remove the optional site assignment from users."""
    op.drop_index('ix_users_site_id', table_name='users')
    op.drop_constraint('fk_users_site_id_sites', 'users', type_='foreignkey')
    op.drop_column('users', 'site_id')
