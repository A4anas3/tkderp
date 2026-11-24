import React, { useState } from 'react';
import { Undo2, AlertTriangle, RotateCcw } from 'lucide-react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';
import { admissionApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { getCleanCancelReason } from '../../utils/dateCycleUtils';

export default function CancelPurchaseModal({
  isOpen,
  onClose,
  admission,
  item = null,
  onSuccess,
}) {
  const { success, error } = useToast();
  const [reason, setReason] = useState('');
  const [issueRefund, setIssueRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMode, setRefundMode] = useState('CASH');
  const [submitting, setSubmitting] = useState(false);

  // Sync state when admission or target item changes
  React.useEffect(() => {
    if (admission) {
      setReason('');
      const matched = item
        ? (admission.items || []).find((i) => i.id === item.id) || item
        : null;
      const paid = Number(matched ? matched.amount_collected || 0 : admission.amount_paid || 0);
      setIssueRefund(paid > 0);
      setRefundAmount(paid > 0 ? String(paid) : '0');
      setRefundMode('CASH');
    }
  }, [admission, item]);

  if (!admission) return null;

  const targetItem = item
    ? (admission.items || []).find((i) => i.id === item.id) || item
    : null;
  const maxPaid = Number(targetItem ? targetItem.amount_collected || 0 : admission.amount_paid || 0);
  const totalBilled = Number(
    targetItem ? targetItem.net_price ?? targetItem.original_price ?? 0 : admission.total_payable || 0
  );
  const balanceDue = Number(targetItem ? targetItem.balance_due || 0 : admission.balance_due || 0);
  const displayItems = targetItem ? [targetItem] : (admission.items || []);
  const txnId = admission.purchase_transaction_id || admission.admission_number;
  const isCannotCancel = targetItem ? targetItem.can_cancel === false : admission.can_cancel === false;
  const targetSubjectName = targetItem
    ? targetItem.item_name_snapshot || targetItem.subject_name
    : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isCannotCancel) {
      error('Cannot cancel an expired or completed admission.');
      return;
    }
    const cleanR = getCleanCancelReason(reason);
    if (!cleanR) {
      error('Please provide a valid, descriptive reason for cancelling this purchase');
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
      const payload = targetItem
        ? {
            reason: cleanR,
            scope: 'SELECTED_ITEMS',
            item_ids: [targetItem.id],
            refund_amount: refundVal,
            refund_mode: refundMode,
            ...(refundVal > 0
              ? { line_refunds: [{ item_id: targetItem.id, refund_amount: refundVal }] }
              : {}),
          }
        : {
            reason: cleanR,
            refund_amount: refundVal,
            refund_mode: refundMode,
          };

      const res = await admissionApi.revoke(admission.id, payload);
      const cancelLabel = targetItem
        ? `${targetSubjectName} (${txnId})`
        : `Course purchase (${txnId})`;
      success(
        `${cancelLabel} cancelled successfully.${
          refundVal > 0 ? ` Refunded ₹${refundVal} to student.` : ''
        }`
      );

      onClose();
      if (onSuccess) {
        onSuccess(res, refundVal > 0);
      }
    } catch (err) {
      error(err.message || 'Failed to cancel course purchase');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={targetItem ? `Cancel Course: ${targetSubjectName}` : 'Cancel Course Purchase'}
      subtitle={
        targetItem
          ? 'Cancelling this course drops the student from this subject’s active list and voids its pending balance due'
          : 'Cancelling this purchase drops the student from active class attendance lists and voids pending balance due'
      }
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Purchase Transaction Summary */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Purchase Transaction ID:</span>
            <span className="font-mono font-bold text-odoo-700 text-sm">{txnId}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Student Name:</span>
            <span className="font-bold text-black">{admission.student_name_snapshot}</span>
          </div>

          <div className="pt-1 border-t border-slate-200">
            <span className="text-[11px] font-semibold text-slate-600 block mb-0.5">
              {targetItem ? 'Course Item to Cancel:' : 'Enrolled Subjects / Course Items:'}
            </span>
            <div className="space-y-0.5">
              {displayItems.map((itm, i) => (
                <div key={i} className="text-[11px] font-medium text-black flex items-center justify-between">
                  <span>• {itm.item_name_snapshot || itm.subject_name}</span>
                  <span className="font-mono text-slate-600">
                    ₹{Number(itm.original_price ?? itm.net_price ?? 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-1.5 border-t border-slate-200 flex justify-between items-center">
            <div>
              <span className="text-slate-500 block text-[10px]">Total Billed</span>
              <span className="font-mono font-bold text-black text-xs">
                ₹{totalBilled.toFixed(2)}
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
                ₹{balanceDue.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Reason for Revocation */}
        <div>
          <label className="block text-xs font-semibold text-black mb-1">
            Reason for Revoking / Cancelling Enrollment <span className="text-rose-600">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Student dropping subject due to school timetable clash or changing stream"
            rows={2}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-black bg-white focus:outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-600"
            required
            autoFocus
          />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {[
              'Timetable / Schedule clash',
              'Personal / Relocation',
              'Incorrect subject enrolled',
              'Student discontinued coaching'
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded border border-slate-200 transition"
              >
                {preset}
              </button>
            ))}
          </div>
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

        {isCannotCancel && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
            This admission is expired or completed and cannot be cancelled.
          </div>
        )}

        {/* Confirmation Buttons */}
        <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} disabled={submitting} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={isCannotCancel}
            loading={submitting}
            icon={Undo2}
            className="w-full sm:w-auto"
          >
            Confirm Cancellation
          </Button>
        </div>
      </form>
    </Modal>
  );
}
