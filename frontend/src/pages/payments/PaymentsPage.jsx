import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  CreditCard,
  Printer,
  ReceiptIndianRupee,
  Search,
  Edit2,
  RotateCcw,
  AlertTriangle,
  History,
  ExternalLink,
} from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { paymentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';
import EditPaymentModal from '../../components/modals/EditPaymentModal';
import IssueRefundModal from '../../components/modals/IssueRefundModal';
import RefundReceiptModal from '../../components/receipts/RefundReceiptModal';
import PaymentDetailModal from '../../components/modals/PaymentDetailModal';

export default function PaymentsPage() {
  const navigate = useNavigate();
  const { error } = useToast();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('payments'); // 'payments' | 'refunds'

  // Payments State
  const [payments, setPayments] = useState([]);
  const [totalPayments, setTotalPayments] = useState(0);
  const [payPage, setPayPage] = useState(1);
  const [paySearch, setPaySearch] = useState('');
  const [loadingPayments, setLoadingPayments] = useState(true);

  // Refunds State
  const [refunds, setRefunds] = useState([]);
  const [totalRefunds, setTotalRefunds] = useState(0);
  const [refundPage, setRefundPage] = useState(1);
  const [refundSearch, setRefundSearch] = useState('');
  const [loadingRefunds, setLoadingRefunds] = useState(false);

  // Modals
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [receiptToShow, setReceiptToShow] = useState(null);
  const [detailPayment, setDetailPayment] = useState(null);

  // Edit Payment Modal
  const [editingPayment, setEditingPayment] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Issue Refund Modal
  const [refundingAdmission, setRefundingAdmission] = useState(null);
  const [refundingPayment, setRefundingPayment] = useState(null);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundReceiptToShow, setRefundReceiptToShow] = useState(null);

  const loadPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const res = await paymentApi.list({
        page: payPage,
        page_size: 15,
        search: paySearch.trim() || undefined,
      });
      setPayments(res.items || []);
      setTotalPayments(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load payments');
    } finally {
      setLoadingPayments(false);
    }
  }, [payPage, paySearch]);

  const loadRefunds = useCallback(async () => {
    setLoadingRefunds(true);
    try {
      const res = await paymentApi.listRefunds({
        page: refundPage,
        page_size: 15,
        search: refundSearch.trim() || undefined,
      });
      setRefunds(res.items || []);
      setTotalRefunds(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load refunds');
    } finally {
      setLoadingRefunds(false);
    }
  }, [refundPage, refundSearch]);

  useEffect(() => {
    if (activeTab === 'payments') {
      loadPayments();
    } else {
      loadRefunds();
    }
  }, [activeTab, loadPayments, loadRefunds]);

  const handleViewReceipt = async (p) => {
    try {
      const receipt = await paymentApi.getReceipt(p.id);
      setReceiptToShow(receipt);
    } catch (err) {
      error(err.message || 'Failed to fetch receipt details');
    }
  };

  const handleOpenEditPayment = (p) => {
    setEditingPayment(p);
    setIsEditModalOpen(true);
  };

  const handleOpenRefund = (p) => {
    setRefundingAdmission({
      id: p.admission_id,
      admission_number: p.admission_number,
      student_name_snapshot: p.student_name,
      amount_paid: p.amount,
      balance_due: 0,
      total_payable: p.amount,
    });
    setRefundingPayment(p);
    setIsRefundModalOpen(true);
  };

  const handleViewRefundVoucher = async (r) => {
    try {
      const voucher = await paymentApi.getRefundReceipt(r.id);
      setRefundReceiptToShow(voucher);
    } catch (err) {
      error(err.message || 'Failed to fetch refund voucher');
    }
  };

  // Columns for Payments Table
  const paymentColumns = [
    {
      header: 'Receipt No',
      accessor: 'payment_number',
      className: 'font-mono font-bold text-odoo-700 w-28',
    },
    {
      header: 'Student Name',
      render: (p) => (
        <div>
          <span className="font-bold text-black block">{p.student_name}</span>
          <span className="text-[11px] text-slate-700 font-mono font-medium">
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
      header: 'Mode & Ref',
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
            <span className="text-[10px] text-slate-700 block font-mono font-semibold">
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
      className: 'font-mono text-xs text-slate-600 w-32',
      render: (p) =>
        p.payment_date
          ? new Date(p.payment_date).toLocaleString('en-IN', {
              dateStyle: 'short',
              timeStyle: 'short',
            })
          : '—',
    },
    {
      header: 'Actions',
      className: 'text-right w-64 whitespace-nowrap',
      render: (p) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <Button
            size="xs"
            variant="info"
            icon={ExternalLink}
            onClick={() => navigate(`/payments/${p.id}`)}
            title="Open Dedicated Payment Page"
          >
            Detail
          </Button>

          <Button
            size="xs"
            variant="indigo"
            icon={Printer}
            onClick={() => handleViewReceipt(p)}
          >
            Slip
          </Button>

          {isAdmin && (
            <>
              <Button
                size="xs"
                variant="amber"
                icon={Edit2}
                onClick={() => handleOpenEditPayment(p)}
              >
                Edit
              </Button>

              <Button
                size="xs"
                variant="orange"
                onClick={() => handleOpenRefund(p)}
              >
                Refund
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  // Columns for Refunds Table
  const refundColumns = [
    {
      header: 'Refund Voucher No',
      accessor: 'refund_number',
      className: 'font-mono font-bold text-amber-900 w-32',
    },
    {
      header: 'Student Name',
      render: (r) => (
        <div>
          <span className="font-bold text-black block">{r.student_name}</span>
          <span className="text-[11px] text-slate-700 font-mono font-medium">
            Admission: {r.admission_number}
          </span>
        </div>
      ),
    },
    {
      header: 'Refund Amount',
      className: 'text-right font-mono font-bold text-amber-900 text-sm w-32',
      render: (r) => `-₹${Number(r.amount).toFixed(2)}`,
    },
    {
      header: 'Mode',
      render: (r) => (
        <Badge size="xs" variant="warning">
          {r.refund_mode}
        </Badge>
      ),
    },
    {
      header: 'Mandatory Reason',
      render: (r) => (
        <span className="text-xs text-slate-800 italic block max-w-xs truncate" title={r.reason}>
          {r.reason}
        </span>
      ),
    },
    {
      header: 'Disbursed By',
      accessor: 'processor_name_snapshot',
      className: 'text-xs text-slate-700',
    },
    {
      header: 'Date & Time',
      className: 'font-mono text-xs text-slate-600 w-32',
      render: (r) =>
        r.refund_date
          ? new Date(r.refund_date).toLocaleString('en-IN', {
              dateStyle: 'short',
              timeStyle: 'short',
            })
          : '—',
    },
    {
      header: 'Actions',
      className: 'text-right w-28 whitespace-nowrap',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <Button
            size="xs"
            variant="indigo"
            icon={Printer}
            onClick={() => handleViewRefundVoucher(r)}
          >
            Voucher
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">Fee Collection & Refund Management</h1>
          <p className="text-xs text-slate-700 mt-0.5 font-medium">
            Realized cash collections, editable payment receipts, and fee refund audit logs
          </p>
        </div>

        <Button
          variant="success"
          icon={CreditCard}
          onClick={() => setIsCollectModalOpen(true)}
          className="w-full sm:w-auto"
        >
          Collect Fee Payment
        </Button>
      </div>

      {/* Tabs Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveTab('payments')}
          className={`flex items-center gap-1.5 px-3 py-2 min-h-[36px] text-xs font-bold rounded-t-lg transition border-b-2 cursor-pointer ${
            activeTab === 'payments'
              ? 'border-odoo-600 text-odoo-900 bg-purple-50/50'
              : 'border-transparent text-slate-600 hover:text-black hover:bg-slate-100'
          }`}
        >
          <ReceiptIndianRupee className="w-3.5 h-3.5" />
          <span>Fee Collections ({totalPayments})</span>
        </button>

        <button
          onClick={() => setActiveTab('refunds')}
          className={`flex items-center gap-1.5 px-3 py-2 min-h-[36px] text-xs font-bold rounded-t-lg transition border-b-2 cursor-pointer ${
            activeTab === 'refunds'
              ? 'border-amber-600 text-amber-950 bg-amber-50/50'
              : 'border-transparent text-slate-600 hover:text-black hover:bg-slate-100'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Refunds Disbursed ({totalRefunds})</span>
        </button>
      </div>

      {/* Tab 1: Payments List */}
      {activeTab === 'payments' && (
        <DataTable
          columns={paymentColumns}
          data={payments}
          total={totalPayments}
          page={payPage}
          pageSize={15}
          onPageChange={(p) => setPayPage(p)}
          searchValue={paySearch}
          onSearchChange={(val) => {
            setPaySearch(val);
            setPayPage(1);
          }}
          onRefresh={loadPayments}
          loading={loadingPayments}
          onRowClick={(p) => navigate(`/payments/${p.id}`)}
          searchPlaceholder="Search by student name, receipt number, or reference..."
          emptyMessage="No fee payments recorded."
        />
      )}

      {/* Tab 2: Refunds List */}
      {activeTab === 'refunds' && (
        <DataTable
          columns={refundColumns}
          data={refunds}
          total={totalRefunds}
          page={refundPage}
          pageSize={15}
          onPageChange={(p) => setRefundPage(p)}
          searchValue={refundSearch}
          onSearchChange={(val) => {
            setRefundSearch(val);
            setRefundPage(1);
          }}
          onRefresh={loadRefunds}
          loading={loadingRefunds}
          onRowClick={(r) => setRefundReceiptToShow(r)}
          searchPlaceholder="Search by student name or refund voucher number..."
          emptyMessage="No fee refunds recorded yet."
        />
      )}

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

      {/* Edit Payment Record Modal */}
      <EditPaymentModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingPayment(null);
        }}
        payment={editingPayment}
        onSuccess={() => {
          loadPayments();
        }}
      />

      {/* Issue Refund Modal */}
      <IssueRefundModal
        isOpen={isRefundModalOpen}
        onClose={() => {
          setIsRefundModalOpen(false);
          setRefundingAdmission(null);
          setRefundingPayment(null);
        }}
        admission={refundingAdmission}
        payment={refundingPayment}
        onSuccess={(receipt) => {
          setRefundReceiptToShow(receipt);
          if (activeTab === 'refunds') {
            loadRefunds();
          } else {
            loadPayments();
          }
        }}
      />

      {/* Printable Refund Voucher Modal */}
      <RefundReceiptModal
        isOpen={!!refundReceiptToShow}
        onClose={() => setRefundReceiptToShow(null)}
        refund={refundReceiptToShow}
      />

      {/* Payment Detail Modal */}
      <PaymentDetailModal
        isOpen={!!detailPayment}
        onClose={() => setDetailPayment(null)}
        payment={detailPayment}
        isAdmin={isAdmin}
        onPrintReceipt={(p) => handleViewReceipt(p)}
        onIssueRefund={(p) => handleOpenRefund(p)}
        onEditPayment={(p) => handleOpenEditPayment(p)}
      />
    </div>
  );
}
