import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Printer,
  CreditCard,
  User,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  BookOpen,
  Award,
  RefreshCw,
  Phone,
  ShieldAlert,
  RotateCcw,
  FileText,
  Sparkles
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { admissionApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import AdmissionReceiptModal from '../../components/receipts/AdmissionReceiptModal';
import AdmissionAllSlipsModal from '../../components/receipts/AdmissionAllSlipsModal';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';
import IssueRefundModal from '../../components/modals/IssueRefundModal';
import RefundReceiptModal from '../../components/receipts/RefundReceiptModal';
import WaiveDueModal from '../../components/modals/WaiveDueModal';
import { formatIndianDate, formatCycleLabel, evaluateCycleStatus } from '../../utils/dateCycleUtils';

export default function AdmissionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { isAdmin } = useAuth();

  const [admission, setAdmission] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals for actions
  const [slipModalOpen, setSlipModalOpen] = useState(false);
  const [allSlipsModalOpen, setAllSlipsModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [waiveModalOpen, setWaiveModalOpen] = useState(false);
  const [paymentReceiptToShow, setPaymentReceiptToShow] = useState(null);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundReceiptToShow, setRefundReceiptToShow] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadAdmission = useCallback(async () => {
    setLoading(true);
    try {
      const data = await admissionApi.get(id);
      setAdmission(data);
    } catch (err) {
      error(err.message || 'Failed to load admission details');
    } finally {
      setLoading(false);
    }
  }, [id, error]);

  useEffect(() => {
    loadAdmission();
  }, [loadAdmission]);

  const handleRevoke = async () => {
    if (admission && Number(admission.amount_paid || 0) > 0) {
      setRefundModalOpen(true);
    } else {
      const reason = window.prompt('Enter reason for revoking this course purchase (e.g. Student dropped out):');
      if (!reason || !reason.trim()) return;

      setRevoking(true);
      try {
        await admissionApi.revoke(id, { reason: reason.trim() });
        success('Course purchase has been revoked.');
        loadAdmission();
      } catch (err) {
        error(err.message || 'Failed to revoke course purchase');
      } finally {
        setRevoking(false);
      }
    }
  };

  const handleRestore = async () => {
    if (!window.confirm('Restore this course purchase and reactivate student access?')) return;

    setRestoring(true);
    try {
      await admissionApi.restore(id);
      success('Course purchase has been restored to Active status.');
      loadAdmission();
    } catch (err) {
      error(err.message || 'Failed to restore course purchase');
    } finally {
      setRestoring(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
          <ArrowLeft className="w-4 h-4 animate-spin text-odoo-600" />
          <span>Loading course purchase details...</span>
        </div>
        <div className="bg-white rounded-xl p-8 border border-slate-200 animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/3"></div>
          <div className="h-12 bg-slate-100 rounded"></div>
          <div className="h-32 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (!admission) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/admissions')}>
          Back to Course Purchases
        </Button>
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
          <p className="text-sm font-semibold text-rose-700">Admission / Purchase record not found.</p>
        </div>
      </div>
    );
  }

  const isRevoked = admission.status === 'REVOKED';
  const isCancelled = admission.status === 'CANCELLED';
  const isInactive = isRevoked || isCancelled;
  const isActive = admission.status === 'ACTIVE';

  const validFrom = admission.valid_from || admission.admission_date;
  const validTo = admission.valid_to;
  const cycleInfo = evaluateCycleStatus(validTo, admission.balance_due, isInactive);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate('/admissions')}
            className="p-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center"
            title="Back to Course Purchases"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-black break-words leading-tight">
                Course Purchase & Enrollment
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold border border-slate-200 shrink-0">
                {admission.admission_number}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
              Transaction ID: {admission.purchase_transaction_id || admission.admission_number} • Enrolled on {formatIndianDate(admission.admission_date)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="secondary"
            icon={FileText}
            onClick={() => setAllSlipsModalOpen(true)}
            size="sm"
            title="View all enrollment invoices, partial payment receipts & refund vouchers"
          >
            All Slips & Receipts ▾
          </Button>

          <Button
            variant="secondary"
            icon={Printer}
            onClick={() => setSlipModalOpen(true)}
            size="sm"
          >
            Print Enrollment Slip
          </Button>

          {Number(admission.balance_due || 0) > 0 && admission.status !== 'REVOKED' && admission.status !== 'CANCELLED' && (
            <Button
              variant="success"
              icon={CreditCard}
              onClick={() => setPayModalOpen(true)}
              size="sm"
            >
              Collect Fee (₹{Number(admission.balance_due || 0).toLocaleString('en-IN')})
            </Button>
          )}

          {isAdmin && Number(admission.balance_due || 0) > 0 && admission.status !== 'REVOKED' && admission.status !== 'CANCELLED' && (
            <Button
              variant="warning"
              icon={Sparkles}
              onClick={() => setWaiveModalOpen(true)}
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold border-amber-600"
              title="Admin only: Waive / forgive pending fee due"
            >
              Waive Due
            </Button>
          )}

          {isAdmin && isActive && admission.can_cancel && (
            <Button
              variant="danger"
              icon={ShieldAlert}
              onClick={handleRevoke}
              loading={revoking}
              size="sm"
            >
              {Number(admission.amount_paid || 0) > 0 ? 'Full Refund & Cancel' : 'Cancel Purchase'}
            </Button>
          )}

          {isAdmin && isInactive && (
            <Button
              variant="primary"
              icon={RotateCcw}
              onClick={handleRestore}
              loading={restoring}
              size="sm"
            >
              Restore to Active
            </Button>
          )}
        </div>
      </div>

      {/* Prominent Active vs Not Active Status Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
          isActive
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : isRevoked
            ? 'bg-rose-50 border-rose-300 text-rose-950'
            : 'bg-slate-100 border-slate-300 text-slate-800'
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
              Enrollment Status: {isActive ? 'ACTIVE COURSE PURCHASE' : isRevoked ? 'NOT ACTIVE (REVOKED)' : 'NOT ACTIVE (CANCELLED)'}
            </div>
            <div className="text-xs text-slate-700 font-medium mt-0.5">
              {isActive
                ? 'Student has active batch admission and valid class attendance rights'
                : admission.revocation_reason
                ? `Access Revoked: ${admission.revocation_reason}`
                : 'Enrollment has been deactivated or cancelled'}
            </div>
          </div>
        </div>
        <Badge
          variant={isActive ? 'success' : 'danger'}
          size="md"
          className="uppercase font-bold tracking-wider self-start sm:self-auto"
        >
          {admission.status}
        </Badge>
      </div>

      {/* Student Quick Bio Card */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-purple-100 text-odoo-700 font-black flex items-center justify-center text-sm border border-purple-200 shrink-0">
            {admission.student_name_snapshot ? admission.student_name_snapshot.slice(0, 2).toUpperCase() : 'ST'}
          </div>
          <div>
            <h2 className="font-bold text-black text-base">
              {admission.student_name_snapshot}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-0.5">
              <span className="font-mono font-semibold">Adm No: {admission.admission_number}</span>
              <span>•</span>
              <span>Enrolled: {formatIndianDate(admission.admission_date)}</span>
              {admission.student_id && (
                <>
                  <span>•</span>
                  <span className="font-mono text-slate-500">ID: {String(admission.student_id).slice(0, 8)}...</span>
                </>
              )}
            </div>
          </div>
        </div>

        {admission.student_id && (
          <Link
            to={`/students/${admission.student_id}`}
            className="px-3 py-1.5 text-xs font-bold bg-slate-50 hover:bg-purple-50 text-odoo-700 border border-purple-200 rounded-lg shadow-2xs flex items-center gap-1.5 self-start sm:self-auto transition-colors"
          >
            <User className="w-3.5 h-3.5" />
            <span>Open Student Profile</span>
            <ExternalLink className="w-3 h-3 text-odoo-400" />
          </Link>
        )}
      </div>

      {/* Rolling Date-to-Date Fee Cycle Card */}
      <div className={`${isInactive ? 'bg-rose-50/50 border-rose-200' : 'bg-purple-50/60 border-purple-200'} p-4 rounded-xl border space-y-3 shadow-2xs`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
            <Calendar className={`w-4 h-4 ${isInactive ? 'text-rose-600' : 'text-odoo-700'}`} />
            <span>Rolling Date-to-Date Monthly Fee Cycle</span>
          </div>
          <Badge variant={cycleInfo.variant} size="xs">
            {cycleInfo.label}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-[11px] text-slate-500 block font-medium">Cycle Period Window</span>
            <span className="font-mono font-bold text-black text-sm">
              {formatCycleLabel(validFrom, validTo)}
            </span>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {admission.valid_from ? formatIndianDate(admission.valid_from) : '—'} to {admission.valid_to ? formatIndianDate(admission.valid_to) : '—'}
            </div>
          </div>
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-[11px] text-slate-500 block font-medium">Individual Billing Anchor</span>
            <span className="font-bold text-slate-900 text-sm">
              Day {validFrom ? parseInt(validFrom.split('-')[2], 10) : '—'} of month
            </span>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Cycle rolls on enrollment date
            </div>
          </div>
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-[11px] text-slate-500 block font-medium">Renewal Due Status</span>
            <span className={`font-bold text-sm ${isInactive ? 'text-rose-700' : cycleInfo.variant === 'danger' ? 'text-rose-700' : cycleInfo.variant === 'warning' ? 'text-amber-800' : 'text-emerald-800'}`}>
              {cycleInfo.label}
            </span>
            <div className={`text-[10px] mt-0.5 font-medium ${isInactive ? 'text-rose-700' : 'text-slate-600'}`}>
              {isInactive ? (admission.revocation_reason || 'Course purchase cancelled / revoked') : cycleInfo.subtext}
            </div>
          </div>
        </div>
      </div>

      {/* Itemized Purchased Courses / Batches */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-black text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-odoo-600" />
            <span>Enrolled Subjects & Assigned Batches</span>
          </h3>
          <span className="text-xs text-slate-500 font-medium">
            {admission.items?.length || 0} enrolled course(s)
          </span>
        </div>

        <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
          <table className="w-full text-left text-xs min-w-[650px]">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3">Course / Batch</th>
                <th className="p-3">Faculty & Hall</th>
                <th className="p-3">Rolling Cycle Window</th>
                <th className="p-3 text-right">Fee Rate</th>
                <th className="p-3 text-right">Discount</th>
                <th className="p-3 text-right font-bold text-black">Net Billed</th>
                <th className="p-3 text-right text-emerald-800">Collected</th>
                <th className="p-3 text-right text-rose-700">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admission.items?.map((itm, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60">
                  <td className="p-3">
                    <div className="font-bold text-black">{itm.item_name_snapshot || itm.batch_name_snapshot || 'Course Enrollment'}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {itm.subject_code ? `Code: ${itm.subject_code}` : ''}
                    </div>
                  </td>
                  <td className="p-3 text-slate-700">
                    <div className="font-semibold text-black">{itm.teacher_name_snapshot || 'Faculty'}</div>
                    <div className="text-[11px] text-slate-500">{itm.hall_number_snapshot || itm.hall_number ? `Hall: ${itm.hall_number_snapshot || itm.hall_number}` : 'Main Campus'}</div>
                  </td>
                  <td className="p-3">
                    <div className="font-mono font-bold text-black text-[11px]">
                      {formatCycleLabel(itm.valid_from || validFrom, itm.valid_to || validTo)}
                    </div>
                    <div className="text-[10px] text-odoo-700 font-medium">
                      Monthly Cycle
                    </div>
                  </td>
                  <td className="p-3 text-right font-mono text-slate-700 font-semibold">
                    ₹{Number(itm.original_price ?? itm.original_fee ?? 0).toFixed(2)}
                  </td>
                  <td className="p-3 text-right font-mono text-rose-600 font-medium">
                    {Number(itm.discount_amount ?? 0) > 0 ? `-₹${Number(itm.discount_amount).toFixed(2)}` : '₹0.00'}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-black">
                    ₹{Number(itm.net_price ?? 0).toFixed(2)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-800">
                    ₹{Number(itm.amount_collected ?? 0).toFixed(2)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-rose-700">
                    <div>₹{Number(itm.balance_due ?? 0).toFixed(2)}</div>
                    {Number(itm.written_off_amount ?? 0) > 0 && (
                      <span className="block text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1 rounded mt-0.5 w-fit ml-auto">
                        ₹{Number(itm.written_off_amount).toFixed(0)} waived
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial KPI Summary Bar */}
        <div className={`p-4 bg-slate-50 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-${Number(admission.written_off_amount || 0) > 0 ? '5' : '4'} gap-3 text-xs`}>
          <div>
            <span className="text-slate-500 block text-[11px]">Total Net Payable</span>
            <span className="font-mono font-black text-black text-base">
              ₹{Number(admission.total_payable ?? 0).toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Total Realized Cash</span>
            <span className="font-mono font-black text-emerald-800 text-base">
              ₹{Number(admission.amount_paid ?? 0).toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Outstanding Due</span>
            <span className="font-mono font-black text-rose-700 text-base">
              ₹{Number(admission.balance_due ?? 0).toFixed(2)}
            </span>
          </div>
          {Number(admission.written_off_amount ?? 0) > 0 && (
            <div>
              <span className="text-amber-800 block text-[11px] font-bold">Fee Waived (Forgiven)</span>
              <span className="font-mono font-black text-amber-900 text-base">
                ₹{Number(admission.written_off_amount).toFixed(2)}
              </span>
            </div>
          )}
          <div>
            <span className="text-slate-500 block text-[11px]">Payment Status</span>
            <Badge
              variant={
                isInactive
                  ? 'danger'
                  : admission.payment_status === 'PAID'
                  ? 'success'
                  : admission.payment_status === 'PARTIAL'
                  ? 'warning'
                  : 'danger'
              }
              size="sm"
              className="mt-1 font-bold"
            >
              {isInactive ? 'CANCELLED' : admission.payment_status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Recorded Payment Transactions */}
      {admission.payments && admission.payments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-black text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <span>Payment Receipts Recorded Against this Purchase</span>
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {admission.payments.length} transaction(s)
            </span>
          </div>

          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full text-left text-xs min-w-[600px]">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Receipt Number</th>
                  <th className="p-3">Payment Date</th>
                  <th className="p-3">Mode</th>
                  <th className="p-3 text-right">Amount Paid</th>
                  <th className="p-3">Cashier</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admission.payments.map((p, idx) => (
                  <tr
                    key={idx}
                    onClick={() => navigate(`/payments/${p.id}`)}
                    className="hover:bg-purple-50/40 cursor-pointer transition-colors"
                    title="Click to view payment detail page"
                  >
                    <td className="p-3 font-mono font-bold text-odoo-700 hover:underline">
                      {p.receipt_number || p.id}
                    </td>
                    <td className="p-3 font-mono text-black">
                      {formatIndianDate(p.payment_date)}
                    </td>
                    <td className="p-3">
                      <Badge variant="neutral" size="xs">
                        {p.payment_mode}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-mono font-black text-emerald-800">
                      ₹{Number(p.amount ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-slate-700 font-medium">
                      {p.cashier_name_snapshot || 'Cashier'}
                    </td>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Link
                        to={`/payments/${p.id}`}
                        className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-black font-semibold rounded border border-slate-300 inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-600" />
                        <span>Receipt</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Slips (Multi-Slip Picker & Comprehensive Statement Modal) */}
      <AdmissionAllSlipsModal
        isOpen={allSlipsModalOpen}
        onClose={() => setAllSlipsModalOpen(false)}
        admissionId={admission?.id}
        admissionData={admission}
      />

      {/* Slip Modal */}
      <AdmissionReceiptModal
        isOpen={slipModalOpen}
        onClose={() => setSlipModalOpen(false)}
        admission={admission}
      />

      {/* Quick Payment Modal */}
      <QuickPaymentModal
        isOpen={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        initialAdmissionId={admission.id}
        onPaymentSuccess={(receipt) => {
          setPaymentReceiptToShow(receipt);
          loadAdmission();
        }}
      />

      {/* Waive Due Modal */}
      <WaiveDueModal
        isOpen={waiveModalOpen}
        onClose={() => setWaiveModalOpen(false)}
        admission={admission}
        onSuccess={() => {
          loadAdmission();
        }}
      />

      {/* Payment Receipt Modal */}
      <PaymentReceiptModal
        isOpen={!!paymentReceiptToShow}
        onClose={() => setPaymentReceiptToShow(null)}
        receipt={paymentReceiptToShow}
      />

      {/* Issue Refund / Revoke Modal */}
      <IssueRefundModal
        isOpen={refundModalOpen}
        onClose={() => setRefundModalOpen(false)}
        admission={admission}
        onSuccess={(receipt) => {
          setRefundModalOpen(false);
          setRefundReceiptToShow(receipt);
          loadAdmission();
        }}
      />

      {/* Refund Receipt Modal */}
      <RefundReceiptModal
        isOpen={!!refundReceiptToShow}
        onClose={() => setRefundReceiptToShow(null)}
        refund={refundReceiptToShow}
      />
    </div>
  );
}
