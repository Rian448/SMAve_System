"""add worker and work task models

Revision ID: c8d45e7f2a91
Revises: 86069c630832
Create Date: 2026-02-10 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c8d45e7f2a91'
down_revision = '86069c630832'
branch_labels = None
depends_on = None


def upgrade():
    # Create workers table
    op.create_table('workers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('worker_type', sa.String(length=50), nullable=False),
        sa.Column('is_available', sa.Boolean(), nullable=True),
        sa.Column('specialization', sa.String(length=255), nullable=True),
        sa.Column('branch_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create work_tasks table
    op.create_table('work_tasks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_number', sa.String(length=50), nullable=False),
        sa.Column('job_order_id', sa.String(length=50), nullable=False),
        sa.Column('worker_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('task_type', sa.String(length=50), nullable=False),
        sa.Column('priority', sa.String(length=20), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('estimated_hours', sa.Float(), nullable=True),
        sa.Column('actual_hours', sa.Float(), nullable=True),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('task_number')
    )


def downgrade():
    op.drop_table('work_tasks')
    op.drop_table('workers')
