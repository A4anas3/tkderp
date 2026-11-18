import React, { useState, useEffect, useCallback } from 'react';
import { Plus, CreditCard, Printer, ReceiptIndianRupee, Search } from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { paymentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';

export default function PaymentsPage() {
  const { error } = useToast();
  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [receiptToShow, setReceiptToShow] = useState(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentApi.list({
        page,
        page_size: 15,
        search: search.trim() || undefined,
      });
      setPayments(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const handleViewReceipt = async (p) => {
    try {
      const receipt = await paymentApi.getReceipt(p.id);
      setReceiptToShow(receipt);
    } catch (err) {
      error(err.message || 'Failed to fetch receipt details');
    }
  };

  const columns = [
    {
      header: 'Receipt No',
      accessor: 'payment_number',
      className: 'font-mono font-bold text-indigo-700 w-32',
    },
    {
      header: 'Student Name',
      render: (p) => (
        <div>
          <span className="font-bold text-black block">{p.student_name}</span>
          <span className="text-[11px] text-slate-500 font-mono">
            Admission: {p.admission_number}
          </span>
        </div>
      ),
    },
    {
      header: 'Amount Collected',
      className: 'text-right font-mono font-bold text-emerald-800 text-sm w-32',
      render: (p) => `+₹${Number(p.amount).toFixed(2)}`,
    },
    {
      header: 'Mode & Reference',
      render: (p) => (
        <div className="text-xs">
          <Badge
            size="xs"
            variant={
              p.payment_mode === 'CASH'
                ? 'neutral'
                : p.payment_mode === 'UPI'
                ? 'primary'
                : 'purple'
            }
          >
            {p.payment_mode}
          </Badge>
          {p.transaction_reference && (
            <span className="text-[11px] text-slate-500 block font-mono">
              Ref: {p.transaction_reference}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Collected By',
      accessor: 'collector_name_snapshot',
      className: 'text-xs text-slate-700',
    },
    {
      header: 'Date & Time',
      className: 'font-mono text-xs text-slate-600 w-36',
      render: (p) =>
        p.payment_date ? new Date(p.payment_date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—',
    },
    {
      header: 'Action',
      className: 'text-right w-24',
      render: (p) => (
        <Button
          size="xs"
          variant="secondary"
          icon={Printer}
          onClick={() => handleViewReceipt(p)}
        >
          Receipt
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">Fee Collection History</h1>
          <p className="text-xs text-slate-500">
            Manual transactions, receipt logs, and proportional fee allocations across enrolled subjects
          </p>
        </div>

        <Button
          variant="success"
          icon={CreditCard}
          onClick={() => setIsCollectModalOpen(true)}
        >
          Collect Fee Payment
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={payments}
        total={total}
        page={page}
        pageSize={15}
        onPageChange={(p) => setPage(p)}
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        onRefresh={loadPayments}
        loading={loading}
        searchPlaceholder="Search by student name or receipt number..."
        emptyMessage="No payments recorded."
      />

      {/* Collect Payment Modal */}
      <QuickPaymentModal
        isOpen={isCollectModalOpen}
        onClose={() => setIsCollectModalOpen(false)}
        onPaymentSuccess={(receipt) => {
          setReceiptToShow(receipt);
          loadPayments();
        }}
      />

      {/* Printable Receipt Modal */}
      <PaymentReceiptModal
        isOpen={!!receiptToShow}
        onClose={() => setReceiptToShow(null)}
        receipt={receiptToShow}
      />
    </div>
  );
}
