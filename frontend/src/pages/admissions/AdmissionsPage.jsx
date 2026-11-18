import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, CreditCard, Printer, Eye, Ban } from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { admissionApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import AdmissionReceiptModal from '../../components/receipts/AdmissionReceiptModal';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';

export default function AdmissionsPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { isAdmin } = useAuth();
  const [admissions, setAdmissions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals
  const [slipToShow, setSlipToShow] = useState(null);
  const [payAdmissionId, setPayAdmissionId] = useState(null);
  const [paymentReceiptToShow, setPaymentReceiptToShow] = useState(null);

  const loadAdmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await admissionApi.list({
        page,
        page_size: 15,
        search: search.trim() || undefined,
        payment_status: paymentStatusFilter || undefined,
      });
      setAdmissions(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load admissions');
    } finally {
      setLoading(false);
    }
  }, [page, search, paymentStatusFilter]);

  useEffect(() => {
    loadAdmissions();
  }, [loadAdmissions]);

  const handleCancelAdmission = async (adm) => {
    if (!window.confirm(`Are you sure you want to cancel admission ${adm.admission_number}?`)) {
      return;
    }
    try {
      await admissionApi.cancel(adm.id);
      success(`Admission ${adm.admission_number} has been cancelled.`);
      loadAdmissions();
    } catch (err) {
      error(err.message || 'Failed to cancel admission');
    }
  };

  const columns = [
    {
      header: 'Admission No',
      accessor: 'admission_number',
      className: 'font-mono font-bold text-indigo-700 w-32',
    },
    {
      header: 'Student Name',
      render: (a) => (
        <div>
          <span className="font-bold text-black block">{a.student_name_snapshot}</span>
          <span className="text-[11px] text-slate-500 font-mono">Date: {a.admission_date}</span>
        </div>
      ),
    },
    {
      header: 'Purchased Items / Batches',
      render: (a) => (
        <div className="flex flex-wrap gap-1 max-w-xs">
          {(a.items || []).map((itm, i) => (
            <span
              key={i}
              className="inline-block bg-slate-100 border border-slate-200 text-black px-1.5 py-0.5 rounded text-[11px]"
            >
              {itm.item_name_snapshot}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: 'Total Payable',
      className: 'text-right font-mono font-bold text-black w-28',
      render: (a) => `₹${Number(a.total_payable).toFixed(2)}`,
    },
    {
      header: 'Paid',
      className: 'text-right font-mono text-emerald-800 font-semibold w-24',
      render: (a) => `₹${Number(a.amount_paid).toFixed(2)}`,
    },
    {
      header: 'Due Balance',
      className: 'text-right font-mono font-bold text-rose-700 w-28',
      render: (a) => `₹${Number(a.balance_due).toFixed(2)}`,
    },
    {
      header: 'Payment Status',
      className: 'text-center w-28',
      render: (a) => {
        const variants = {
          PAID: 'success',
          PARTIALLY_PAID: 'warning',
          UNPAID: 'danger',
        };
        return (
          <Badge size="xs" variant={variants[a.payment_status] || 'neutral'}>
            {a.payment_status}
          </Badge>
        );
      },
    },
    {
      header: 'Status',
      className: 'text-center w-20',
      render: (a) => (
        <Badge size="xs" variant={a.status === 'ACTIVE' ? 'neutral' : 'danger'}>
          {a.status}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right w-40',
      render: (a) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="xs"
            variant="secondary"
            icon={Printer}
            onClick={() => setSlipToShow(a)}
            title="View & Print Admission Slip"
          >
            Slip
          </Button>

          {Number(a.balance_due) > 0 && a.status === 'ACTIVE' && (
            <Button
              size="xs"
              variant="success"
              onClick={() => setPayAdmissionId(a.id)}
              title="Collect Remaining Fee"
            >
              Pay
            </Button>
          )}

          {isAdmin && a.status === 'ACTIVE' && (
            <button
              onClick={() => handleCancelAdmission(a)}
              title="Cancel Admission"
              className="p-1 rounded text-slate-400 hover:text-rose-600 transition"
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">Student Admissions</h1>
          <p className="text-xs text-slate-500">
            Multi-batch course admissions, itemized discounts, inclusive GST, and fee settlement
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={() => navigate('/admissions/new')}>
          New Admission
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {[
          { label: 'All Admissions', value: '' },
          { label: 'Unpaid Fees', value: 'UNPAID' },
          { label: 'Partially Paid', value: 'PARTIALLY_PAID' },
          { label: 'Fully Paid', value: 'PAID' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setPaymentStatusFilter(tab.value);
              setPage(1);
            }}
            className={`px-3 py-1 text-xs rounded-full border transition font-medium ${
              paymentStatusFilter === tab.value
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={admissions}
        total={total}
        page={page}
        pageSize={15}
        onPageChange={(p) => setPage(p)}
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        onRefresh={loadAdmissions}
        loading={loading}
        searchPlaceholder="Search by admission number or student name..."
        emptyMessage="No admissions found."
      />

      {/* Admission Slip Modal */}
      <AdmissionReceiptModal
        isOpen={!!slipToShow}
        onClose={() => setSlipToShow(null)}
        admission={slipToShow}
      />

      {/* Collect Fee Modal */}
      <QuickPaymentModal
        isOpen={!!payAdmissionId}
        onClose={() => setPayAdmissionId(null)}
        initialAdmissionId={payAdmissionId}
        onPaymentSuccess={(receipt) => {
          setPaymentReceiptToShow(receipt);
          loadAdmissions();
        }}
      />

      {/* Payment Receipt Modal */}
      <PaymentReceiptModal
        isOpen={!!paymentReceiptToShow}
        onClose={() => setPaymentReceiptToShow(null)}
        receipt={paymentReceiptToShow}
      />
    </div>
  );
}
