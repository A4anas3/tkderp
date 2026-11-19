import React, { useState } from 'react';
import { Undo2, AlertTriangle, RotateCcw } from 'lucide-react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';
import { admissionApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function RevokeBatchModal({
  isOpen,
  onClose,
  admission,
  onSuccess,
}) {
  const { success, error } = useToast();
  const [reason, setReason] = useState('');
  const [issueRefund, setIssueRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMode, setRefundMode] = useState('CASH');
  const [submitting, setSubmitting] = useState(false);

  // Sync state when admission changes
  React.useEffect(() => {
    if (admission) {
      setReason('');
      const paid = Number(admission.amount_paid || 0);
      setIssueRefund(paid > 0);
      setRefundAmount(paid > 0 ? String(paid) : '0');
      setRefundMode('CASH');
    }
  }, [admission]);

  if (!admission) return null;

  const maxPaid = Number(admission.amount_paid || 0);
  const txnId = admission.purchase_transaction_id || admission.admission_number;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      error('Please provide a mandatory reason for revoking / taking back this batch');
      return;
    }

    let refundVal = 0;
    if (issueRefund && maxPaid > 0) {
      refundVal = parseFloat(refundAmount);
      if (isNaN(refundVal) || refundVal < 0) {
        error('Please enter a valid refund amount');
        return;
      }
      if (refundVal > maxPaid) {
        error(`Refund amount ₹${refundVal} cannot exceed fees paid ₹${maxPaid}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        reason: reason.trim(),
        refund_amount: refundVal,
        refund_mode: refundMode,
      };

      const res = await admissionApi.revoke(admission.id, payload);
      success(
        `Batch purchase (${txnId}) revoked successfully.${
          refundVal > 0 ? ` Refunded ₹${refundVal} to student.` : ''
        }`
      );

      onClose();
      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err) {
      error(err.message || 'Failed to revoke batch purchase');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Revoke / Return Batch Purchase"
      subtitle="Taking back this batch drops the student from class lists and voids pending balance due"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Purchase Transaction Summary */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Purchase Transaction ID:</span>
            <span className="font-mono font-bold text-indigo-700 text-sm">{txnId}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Student Name:</span>
            <span className="font-bold text-black">{admission.student_name_snapshot}</span>
          </div>

          <div className="pt-1 border-t border-slate-200">
            <span className="text-[11px] font-semibold text-slate-600 block mb-0.5">
              Enrolled Batch / Course Items:
            </span>
            <div className="space-y-0.5">
              {(admission.items || []).map((itm, i) => (
                <div key={i} className="text-[11px] font-medium text-black flex items-center justify-between">
                  <span>• {itm.item_name_snapshot}</span>
                  <span className="font-mono text-slate-600">₹{Number(itm.original_price).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-1.5 border-t border-slate-200 flex justify-between items-center">
            <div>
              <span className="text-slate-500 block text-[10px]">Total Billed</span>
              <span className="font-mono font-bold text-black text-xs">
                ₹{Number(admission.total_payable).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Total Paid</span>
              <span className="font-mono font-bold text-emerald-800 text-xs">
                ₹{maxPaid.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Balance Due</span>
              <span className="font-mono font-bold text-rose-700 text-xs">
                ₹{Number(admission.balance_due).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Reason for Revocation */}
        <div>
          <label className="block text-xs font-semibold text-black mb-1">
            Reason for Revoking / Taking Back Batch <span className="text-rose-600">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Student taking back this batch due to school timetable clash or changing stream"
            rows={2}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-black bg-white focus:outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-600"
            required
            autoFocus
          />
        </div>

        {/* Optional Refund Section if student paid any fee */}
        {maxPaid > 0 && (
          <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-950">
                <input
                  type="checkbox"
                  checked={issueRefund}
                  onChange={(e) => setIssueRefund(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <span>Refund Paid Fees to Student?</span>
              </label>
              <span className="text-[11px] font-mono text-emerald-800 font-bold">
                Paid: ₹{maxPaid.toFixed(2)}
              </span>
            </div>

            {issueRefund && (
              <div className="pt-2 border-t border-amber-200/80 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Refund Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={maxPaid}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono font-bold text-black bg-white focus:outline-none focus:border-amber-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Disbursement Mode
                  </label>
                  <select
                    value={refundMode}
                    onChange={(e) => setRefundMode(e.target.value)}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-medium text-black bg-white focus:outline-none focus:border-amber-600"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Confirmation Buttons */}
        <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={submitting}
            icon={Undo2}
          >
            Confirm Batch Revocation
          </Button>
        </div>
      </form>
    </Modal>
  );
}
