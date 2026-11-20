"""p2_financial_transactions_ledger_and_revoke_fields

Revision ID: b05e44a70d53
Revises: 526d869c4849
Create Date: 2026-11-21 05:04:12.094429

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b05e44a70d53'
down_revision: Union[str, Sequence[str], None] = '526d869c4849'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema and backfill financial transactions & statuses."""
    # 1. Financial Transactions Table
    op.create_table(
        'financial_transactions',
        sa.Column('txn_number', sa.String(length=50), nullable=False),
        sa.Column('txn_type', sa.String(length=30), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('admission_id', sa.UUID(), nullable=False),
        sa.Column('payment_id', sa.UUID(), nullable=True),
        sa.Column('refund_id', sa.UUID(), nullable=True),
        sa.Column('mode', sa.String(length=30), nullable=False),
        sa.Column('reference', sa.String(length=100), nullable=True),
        sa.Column('signed_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('txn_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['admission_id'], ['admissions.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['payment_id'], ['payments.id'], ),
        sa.ForeignKeyConstraint(['refund_id'], ['refunds.id'], ),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_financial_transactions_admission_id'), 'financial_transactions', ['admission_id'], unique=False)
    op.create_index(op.f('ix_financial_transactions_id'), 'financial_transactions', ['id'], unique=False)
    op.create_index(op.f('ix_financial_transactions_payment_id'), 'financial_transactions', ['payment_id'], unique=False)
    op.create_index(op.f('ix_financial_transactions_refund_id'), 'financial_transactions', ['refund_id'], unique=False)
    op.create_index(op.f('ix_financial_transactions_student_id'), 'financial_transactions', ['student_id'], unique=False)
    op.create_index(op.f('ix_financial_transactions_txn_at'), 'financial_transactions', ['txn_at'], unique=False)
    op.create_index(op.f('ix_financial_transactions_txn_number'), 'financial_transactions', ['txn_number'], unique=True)
    op.create_index(op.f('ix_financial_transactions_txn_type'), 'financial_transactions', ['txn_type'], unique=False)

    # 2. Admission Items Columns
    op.add_column('admission_items', sa.Column('access_status', sa.String(length=30), server_default='ACTIVE', nullable=False))
    op.add_column('admission_items', sa.Column('previous_access_status', sa.String(length=30), nullable=True))
    op.add_column('admission_items', sa.Column('revoke_type', sa.String(length=30), nullable=True))
    op.add_column('admission_items', sa.Column('forfeited_amount', sa.Numeric(precision=12, scale=2), server_default='0.00', nullable=False))
    op.add_column('admission_items', sa.Column('written_off_amount', sa.Numeric(precision=12, scale=2), server_default='0.00', nullable=False))
    op.add_column('admission_items', sa.Column('keep_due', sa.Boolean(), server_default='false', nullable=False))
    op.create_index(op.f('ix_admission_items_access_status'), 'admission_items', ['access_status'], unique=False)

    # 3. Admissions Columns
    op.add_column('admissions', sa.Column('access_status', sa.String(length=30), server_default='ACTIVE', nullable=False))
    op.add_column('admissions', sa.Column('previous_access_status', sa.String(length=30), nullable=True))
    op.add_column('admissions', sa.Column('document_status', sa.String(length=30), server_default='VALID', nullable=False))
    op.add_column('admissions', sa.Column('revoke_type', sa.String(length=30), nullable=True))
    op.add_column('admissions', sa.Column('forfeited_amount', sa.Numeric(precision=12, scale=2), server_default='0.00', nullable=False))
    op.add_column('admissions', sa.Column('written_off_amount', sa.Numeric(precision=12, scale=2), server_default='0.00', nullable=False))
    op.create_index(op.f('ix_admissions_access_status'), 'admissions', ['access_status'], unique=False)
    op.create_index(op.f('ix_admissions_document_status'), 'admissions', ['document_status'], unique=False)

    # 4. Payment Allocations Columns
    op.add_column('payment_allocations', sa.Column('refund_id', sa.UUID(), nullable=True))
    op.add_column('payment_allocations', sa.Column('kind', sa.String(length=20), server_default='PAYMENT', nullable=False))
    op.add_column('payment_allocations', sa.Column('reverses_allocation_id', sa.UUID(), nullable=True))
    op.alter_column('payment_allocations', 'payment_id', existing_type=sa.UUID(), nullable=True)
    op.create_index(op.f('ix_payment_allocations_refund_id'), 'payment_allocations', ['refund_id'], unique=False)
    op.create_foreign_key('fk_payment_allocations_reverses_alloc', 'payment_allocations', 'payment_allocations', ['reverses_allocation_id'], ['id'])
    op.create_foreign_key('fk_payment_allocations_refund_id', 'payment_allocations', 'refunds', ['refund_id'], ['id'], ondelete='CASCADE')

    # 5. Data Migration & Backfills
    bind = op.get_bind()

    # Backfill Admission & AdmissionItem access/document statuses
    bind.execute(sa.text("UPDATE admissions SET access_status = 'REVOKED' WHERE status = 'REVOKED';"))
    bind.execute(sa.text("UPDATE admissions SET document_status = 'VOID', access_status = 'REVOKED' WHERE status = 'CANCELLED';"))
    bind.execute(sa.text("""
        UPDATE admission_items
        SET access_status = 'REVOKED'
        WHERE admission_id IN (SELECT id FROM admissions WHERE status IN ('REVOKED', 'CANCELLED'));
    """))

    # Backfill payments into financial_transactions
    bind.execute(sa.text("""
        INSERT INTO financial_transactions (
            id, txn_number, txn_type, student_id, admission_id, payment_id, refund_id,
            mode, reference, signed_amount, txn_at, created_by, reason, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            'TXN' || to_char(payment_date, 'YYYY') || lpad(row_number() OVER (ORDER BY payment_date)::text, 6, '0'),
            'PAYMENT',
            student_id,
            admission_id,
            id,
            NULL,
            payment_mode,
            transaction_reference,
            amount,
            payment_date,
            collected_by,
            notes,
            payment_date,
            payment_date
        FROM payments;
    """))

    # Backfill refunds into financial_transactions
    bind.execute(sa.text("""
        INSERT INTO financial_transactions (
            id, txn_number, txn_type, student_id, admission_id, payment_id, refund_id,
            mode, reference, signed_amount, txn_at, created_by, reason, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            'TXN' || to_char(refund_date, 'YYYY') || lpad((100000 + row_number() OVER (ORDER BY refund_date))::text, 6, '0'),
            'REFUND',
            student_id,
            admission_id,
            payment_id,
            id,
            refund_mode,
            NULL,
            -amount,
            refund_date,
            processed_by,
            reason,
            refund_date,
            refund_date
        FROM refunds;
    """))

    # Seed number_sequences for TXN
    bind.execute(sa.text("""
        INSERT INTO number_sequences (name, year, last_value)
        VALUES ('TXN', 2026, (SELECT COALESCE(COUNT(*), 0) FROM financial_transactions))
        ON CONFLICT (name, year) DO UPDATE SET last_value = EXCLUDED.last_value;
    """))

    # Recompute payment_status from ledger
    bind.execute(sa.text("UPDATE admissions SET payment_status = 'VOID' WHERE document_status = 'VOID';"))
    bind.execute(sa.text("UPDATE admissions SET payment_status = 'REFUNDED' WHERE document_status != 'VOID' AND amount_paid <= 0 AND id IN (SELECT admission_id FROM refunds);"))
    bind.execute(sa.text("UPDATE admissions SET payment_status = 'PARTIALLY_REFUNDED' WHERE document_status != 'VOID' AND amount_paid > 0 AND id IN (SELECT admission_id FROM refunds);"))
    bind.execute(sa.text("UPDATE admissions SET payment_status = 'PAID' WHERE document_status != 'VOID' AND amount_paid >= total_payable AND id NOT IN (SELECT admission_id FROM refunds);"))
    bind.execute(sa.text("UPDATE admissions SET payment_status = 'PARTIALLY_PAID' WHERE document_status != 'VOID' AND amount_paid > 0 AND amount_paid < total_payable AND id NOT IN (SELECT admission_id FROM refunds);"))
    bind.execute(sa.text("UPDATE admissions SET payment_status = 'UNPAID' WHERE document_status != 'VOID' AND amount_paid <= 0 AND id NOT IN (SELECT admission_id FROM refunds);"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_payment_allocations_refund_id', 'payment_allocations', type_='foreignkey')
    op.drop_constraint('fk_payment_allocations_reverses_alloc', 'payment_allocations', type_='foreignkey')
    op.drop_index(op.f('ix_payment_allocations_refund_id'), table_name='payment_allocations')
    op.alter_column('payment_allocations', 'payment_id', existing_type=sa.UUID(), nullable=False)
    op.drop_column('payment_allocations', 'reverses_allocation_id')
    op.drop_column('payment_allocations', 'kind')
    op.drop_column('payment_allocations', 'refund_id')
    op.drop_index(op.f('ix_admissions_document_status'), table_name='admissions')
    op.drop_index(op.f('ix_admissions_access_status'), table_name='admissions')
    op.drop_column('admissions', 'written_off_amount')
    op.drop_column('admissions', 'forfeited_amount')
    op.drop_column('admissions', 'revoke_type')
    op.drop_column('admissions', 'document_status')
    op.drop_column('admissions', 'previous_access_status')
    op.drop_column('admissions', 'access_status')
    op.drop_index(op.f('ix_admission_items_access_status'), table_name='admission_items')
    op.drop_column('admission_items', 'keep_due')
    op.drop_column('admission_items', 'written_off_amount')
    op.drop_column('admission_items', 'forfeited_amount')
    op.drop_column('admission_items', 'revoke_type')
    op.drop_column('admission_items', 'previous_access_status')
    op.drop_column('admission_items', 'access_status')
    op.drop_table('financial_transactions')
