import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Printer,
  ReceiptIndianRupee,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  CreditCard,
  User,
  RotateCcw,
  ExternalLink,
  BookOpen
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import PaginationBar from '../../components/common/PaginationBar';
import { paymentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';
import IssueRefundModal from '../../components/modals/IssueRefundModal';
import RefundReceiptModal from '../../components/receipts/RefundReceiptModal';
import { formatIndianDate, formatCycleLabel } from '../../utils/dateCycleUtils';

export default function PaymentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { isAdmin } = useAuth();

  const [payment, setPayment] = useState(null);
  const [allocPage, setAllocPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Modals
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundReceiptToShow, setRefundReceiptToShow] = useState(null);

  const loadPayment = useCallback(async () => {
    setLoading(true);
    try {
      const data = await paymentApi.getReceipt(id, { page: allocPage, page_size: 50 });
      setPayment(data);
    } catch (err) {
      error(err.message || 'Failed to load payment transaction');
    } finally {
      setLoading(false);
    }
  }, [id, allocPage, error]);

  useEffect(() => {
    loadPayment();
  }, [loadPayment]);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
          <ArrowLeft className="w-4 h-4 animate-spin text-odoo-600" />
          <span>Loading financial transaction details...</span>
        </div>
        <div className="bg-white rounded-xl p-8 border border-slate-200 animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/3"></div>
          <div className="h-12 bg-slate-100 rounded"></div>
          <div className="h-32 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/payments')}>
          Back to Payments
        </Button>
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
          <p className="text-sm font-semibold text-rose-700">Payment transaction record not found.</p>
        </div>
      </div>
    );
  }

  const isRefunded = payment.is_refunded || payment.status === 'REFUNDED';
  const isActive = !isRefunded && payment.status !== 'CANCELLED';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate('/payments')}
            className="p-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center"
            title="Back to Payments"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-black break-words leading-tight">
                Fee Payment Receipt & Transaction
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 bg-purple-50 text-odoo-800 rounded font-bold border border-odoo-200 shrink-0">
                {payment.receipt_number || 'RECEIPT'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
              Transaction ID: {payment.id} • Processed on {formatIndianDate(payment.payment_date)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="indigo"
            icon={Printer}
            onClick={() => setReceiptModalOpen(true)}
            size="sm"
          >
            Print Receipt Slip
          </Button>

          {isAdmin && isActive && (
            <Button
              variant="orange"
              icon={RotateCcw}
              onClick={() => setRefundModalOpen(true)}
              size="sm"
            >
              Issue Refund
            </Button>
          )}
        </div>
      </div>

      {/* Prominent Active vs Not Active Status Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
          isActive
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : 'bg-rose-50 border-rose-300 text-rose-950'
        }`}
      >
        <div className="flex items-center gap-3">
          {isActive ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          ) : (
            <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
          )}
          <div>
            <div className="text-xs font-black uppercase tracking-wider">
              Financial Status: {isActive ? 'ACTIVE PAYMENT RECORD' : 'NOT ACTIVE (REFUNDED / VOID)'}
            </div>
            <div className="text-xs text-slate-700 font-medium mt-0.5">
              {isActive
                ? 'Realized cash or digital fee collection successfully credited to institute accounts'
                : 'This transaction was refunded or voided. Realized revenue was reversed.'}
            </div>
          </div>
        </div>
        <Badge
          variant={isActive ? 'success' : 'danger'}
          size="md"
          className="uppercase font-bold tracking-wider self-start sm:self-auto"
        >
          {isActive ? 'ACTIVE' : 'REFUNDED'}
        </Badge>
      </div>

      {/* Realized Amount Hero Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Amount Collected
          </span>
          <div className="font-mono font-black text-2xl sm:text-4xl text-emerald-800 mt-1 break-all sm:break-normal">
            ₹{payment.amount ? Number(payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 mt-1">
            <span>Payment Mode:</span>
            <span className="font-bold text-black uppercase">{payment.payment_mode}</span>
            {payment.reference_number && (
              <>
                <span>•</span>
                <span className="font-mono text-slate-500">Ref: {payment.reference_number}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:items-end gap-1 text-xs">
          <div className="text-slate-500">
            Cashier / Processed By: <span className="font-bold text-black">{payment.cashier_name_snapshot || 'System Staff'}</span>
          </div>
          <div className="text-slate-500">
            Payment Date: <span className="font-mono font-semibold text-black">{formatIndianDate(payment.payment_date)}</span>
          </div>
          {payment.admission_id && (
            <Link
              to={`/enrollments/${payment.admission_id}`}
              className="mt-2 text-xs font-bold text-odoo-700 hover:text-odoo-900 inline-flex items-center gap-1"
            >
              <span>View Course Purchase</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Student Details Card */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-purple-100 text-odoo-700 font-black flex items-center justify-center text-sm border border-odoo-200 shrink-0">
            {payment.student_name ? payment.student_name.slice(0, 2).toUpperCase() : 'ST'}
          </div>
          <div>
            <h2 className="font-bold text-black text-base">
              {payment.student_name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-0.5">
              <span className="font-mono font-semibold">Student Code: {payment.student_code}</span>
              {payment.mobile && (
                <>
                  <span>•</span>
                  <span>📞 {payment.mobile}</span>
                </>
              )}
              {payment.admission_number && (
                <>
                  <span>•</span>
                  <span className="font-mono">Adm: {payment.admission_number}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {payment.student_id && (
          <Link
            to={`/students/${payment.student_id}`}
            className="px-3 py-1.5 text-xs font-bold bg-slate-50 hover:bg-purple-50 text-odoo-700 border border-odoo-200 rounded-lg shadow-2xs flex items-center gap-1.5 self-start sm:self-auto transition-colors"
          >
            <User className="w-3.5 h-3.5" />
            <span>Open Student Profile</span>
            <ExternalLink className="w-3 h-3 text-odoo-400" />
          </Link>
        )}
      </div>

      {/* Rolling Date-to-Date Fee Period Window */}
      {(payment.valid_from || payment.valid_to || payment.fee_period) && (
        <div className="bg-purple-50/60 p-4 rounded-xl border border-odoo-200 space-y-2 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-odoo-900 uppercase tracking-wider">
            <Calendar className="w-4 h-4 text-odoo-700" />
            <span>Fee Billing Period Window</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div className="bg-white p-3 rounded-lg border border-purple-100 shadow-2xs">
              <span className="text-[11px] text-slate-500 block font-medium">Covered Period</span>
              <span className="font-mono font-bold text-black text-sm">
                {formatCycleLabel(payment.valid_from, payment.valid_to) || payment.fee_period}
              </span>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {payment.valid_from ? formatIndianDate(payment.valid_from) : ''} {payment.valid_to ? `to ${formatIndianDate(payment.valid_to)}` : ''}
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-purple-100 shadow-2xs">
              <span className="text-[11px] text-slate-500 block font-medium">Billing Cycle Rule</span>
              <span className="font-bold text-odoo-900 text-sm">
                Rolling Date-to-Date Cycle
              </span>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Month starts on student enrollment date
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Itemized Subject / Course Allocations */}
      {payment.allocations && payment.allocations.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-black text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-odoo-600" />
              <span>Subject & Course Revenue Allocations</span>
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {payment.allocations_total ?? payment.allocations.length} allocated item(s)
            </span>
          </div>

          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full text-left text-xs min-w-[550px]">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Subject / Course</th>
                  <th className="p-3">Hall</th>
                  <th className="p-3">Faculty</th>
                  <th className="p-3 text-right">Allocated Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payment.allocations.map((alloc, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="p-3 font-bold text-black">
                      {alloc.subject_name || 'Subject'}
                    </td>
                    <td className="p-3 text-slate-700">
                      {alloc.hall_number || 'Main Campus'}
                    </td>
                    <td className="p-3 text-slate-700">
                      {alloc.teacher_name || 'Faculty'}
                    </td>
                    <td className="p-3 text-right font-mono font-black text-emerald-800">
                      ₹{Number(alloc.allocated_amount || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={allocPage}
            pageSize={payment.allocations_page_size || 50}
            total={payment.allocations_total ?? payment.allocations.length}
            totalPages={payment.allocations_total_pages || 1}
            onPageChange={(p) => setAllocPage(p)}
            loading={loading}
            itemLabel="allocations"
          />
        </div>
      )}

      {/* Notes */}
      {payment.notes && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs text-xs">
          <span className="font-bold text-black uppercase tracking-wider block mb-1">Payment Remarks</span>
          <p className="text-slate-700 font-medium">{payment.notes}</p>
        </div>
      )}

      {/* Printable Receipt Modal */}
      <PaymentReceiptModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        receipt={payment}
      />

      {/* Issue Refund Modal */}
      <IssueRefundModal
        isOpen={refundModalOpen}
        onClose={() => setRefundModalOpen(false)}
        admission={{
          id: payment.admission_id,
          admission_number: payment.admission_number,
          student_name_snapshot: payment.student_name,
          amount_paid: payment.amount,
          balance_due: 0,
          total_payable: payment.amount,
        }}
        payment={payment}
        onSuccess={(refundReceipt) => {
          setRefundModalOpen(false);
          setRefundReceiptToShow(refundReceipt);
          loadPayment();
        }}
      />

      {/* Printable Refund Voucher Modal */}
      <RefundReceiptModal
        isOpen={!!refundReceiptToShow}
        onClose={() => setRefundReceiptToShow(null)}
        refund={refundReceiptToShow}
      />
    </div>
  );
}
