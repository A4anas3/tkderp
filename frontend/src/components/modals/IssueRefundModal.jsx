import React, { useState } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';
import { paymentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function IssueRefundModal({
  isOpen,
  onClose,
  admission,
  payment = null,
  onSuccess,
}) {
  const { success, error } = useToast();
  const [amount, setAmount] = useState('');
  const [refundMode, setRefundMode] = useState('CASH');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!admission) return null;

  const maxRefundable = Number(admission.amount_paid || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const refundAmt = parseFloat(amount);

    if (isNaN(refundAmt) || refundAmt <= 0) {
      error('Please enter a valid refund amount greater than 0');
      return;
    }

    if (refundAmt > maxRefundable) {
      error(`Refund amount ₹${refundAmt} cannot exceed amount paid ₹${maxRefundable}`);
      return;
    }

    if (!reason.trim()) {
      error('Please provide a mandatory reason for issuing the refund');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        admission_id: admission.id,
        payment_id: payment ? payment.id : null,
        amount: refundAmt,
        refund_mode: refundMode,
        reason: reason.trim(),
        notes: notes.trim() || null,
      };

      const res = await paymentApi.refund(payload);
      success(`Refund of ₹${refundAmt} processed successfully (${res.refund_number})`);

      // Fetch refund receipt
      let receiptData = null;
      try {
        receiptData = await paymentApi.getRefundReceipt(res.id);
      } catch {
        receiptData = res;
      }

      onClose();
      if (onSuccess) {
        onSuccess(receiptData);
      }
    } catch (err) {
      error(err.message || 'Failed to process refund');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Issue Student Fee Refund"
      subtitle="Refund paid fees to student with automatic balance adjustment and printable debit voucher"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Admission Snapshot Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Student Name:</span>
            <span className="font-bold text-black">{admission.student_name_snapshot}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Admission No:</span>
            <span className="font-mono font-bold text-black">{admission.admission_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total Billed:</span>
            <span className="font-mono text-black">₹{Number(admission.total_payable).toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
            <span className="text-emerald-800">Total Fees Paid:</span>
            <span className="font-mono text-emerald-800">₹{maxRefundable.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-rose-700 font-semibold">
            <span>Outstanding Due:</span>
            <span className="font-mono">₹{Number(admission.balance_due).toFixed(2)}</span>
          </div>
        </div>

        {maxRefundable <= 0 ? (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>This admission has ₹0.00 fees paid. No refund can be issued.</span>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-black mb-1">
                Refund Amount (₹) <span className="text-rose-600">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={maxRefundable}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Max ₹${maxRefundable}`}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs font-mono font-bold text-black bg-white focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setAmount(String(maxRefundable))}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-xs font-bold text-black shrink-0 transition"
                >
                  Full Refund
                </button>
              </div>
            </div>

            <Select
              label="Refund Disbursement Mode"
              value={refundMode}
              onChange={(e) => setRefundMode(e.target.value)}
              options={[
                { value: 'CASH', label: 'Cash Refund' },
                { value: 'UPI', label: 'UPI / Online Refund' },
                { value: 'BANK_TRANSFER', label: 'Bank Transfer (NEFT/IMPS)' },
                { value: 'OTHER', label: 'Other Mode' },
              ]}
              required
            />

            <div>
              <label className="block text-xs font-semibold text-black mb-1">
                Reason for Refund <span className="text-rose-600">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Dropped Chemistry subject due to timing clash with school"
                rows={2}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-black bg-white focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                required
              />
            </div>

            <Input
              label="Additional Notes / Approver (Optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Approved by Director Sharma"
            />
          </>
        )}

        <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="warning"
            loading={submitting}
            disabled={maxRefundable <= 0}
            icon={RotateCcw}
          >
            Disburse Refund
          </Button>
        </div>
      </form>
    </Modal>
  );
}
