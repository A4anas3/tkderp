import React, { useState, useEffect } from 'react';
import { RotateCcw, AlertTriangle, UserX, ShieldAlert } from 'lucide-react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';
import Badge from '../common/Badge';
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
  const [revokeAdmission, setRevokeAdmission] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const maxRefundable = Number(admission?.amount_paid || 0);

  useEffect(() => {
    if (admission) {
      const paid = Number(admission.amount_paid || 0);
      setAmount(paid > 0 ? String(paid) : '0');
      setRevokeAdmission(true);
      setReason('');
      setNotes('');
      setRefundMode('CASH');
    }
  }, [admission, isOpen]);

  if (!admission) return null;

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
        revoke_admission: revokeAdmission,
      };

      const res = await paymentApi.refund(payload);
      success(
        `Full refund of ₹${refundAmt.toFixed(2)} processed successfully${
          revokeAdmission ? ' and admission revoked' : ''
        } (${res.refund_number})`
      );

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
      title="Issue Full Fee Refund & Revocation"
      subtitle="Disburse full refund to student and optionally revoke course enrollment"
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
            <span className="text-slate-500">Purchase Transaction ID:</span>
            <span className="font-mono font-bold text-black">
              {admission.purchase_transaction_id || admission.admission_number}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total Course Fee Billed:</span>
            <span className="font-mono text-black">₹{Number(admission.total_payable).toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
            <span className="text-emerald-800">Total Fees Paid:</span>
            <span className="font-mono text-emerald-800">₹{maxRefundable.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-700 font-semibold">
            <span>Outstanding Balance Due:</span>
            <span className="font-mono">₹{Number(admission.balance_due).toFixed(2)}</span>
          </div>
        </div>

        {maxRefundable <= 0 ? (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>This admission has ₹0.00 fees paid. No refund can be disbursed.</span>
          </div>
        ) : (
          <>
            {/* Full Refund Banner */}
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                  Full Fee Refund
                </span>
                <span className="text-lg font-black font-mono text-amber-950">
                  ₹{maxRefundable.toFixed(2)}
                </span>
              </div>
              <Badge variant="warning" size="sm">
                Full Refund
              </Badge>
            </div>

            {/* Revocation Option Card */}
            <div className="bg-rose-50/70 border border-rose-200 rounded-lg p-3 space-y-1.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={revokeAdmission}
                  onChange={(e) => setRevokeAdmission(e.target.checked)}
                  className="mt-0.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <span className="text-xs font-bold text-rose-950 block">
                    Revoke Admission & Cancel Enrollment (Full Drop)
                  </span>
                  <span className="text-[11px] text-rose-700 block">
                    Marks admission as REVOKED, removes student from active batch attendance lists, and voids any outstanding dues.
                  </span>
                </div>
              </label>
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
                Reason for Refund & Revocation <span className="text-rose-600">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Student dropped out due to school timetable clash; full refund approved"
                rows={2}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-black bg-white focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                required
                autoFocus
              />
            </div>

            <Input
              label="Internal Approval Notes (Optional)"
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
            {revokeAdmission ? 'Disburse Full Refund & Revoke' : 'Disburse Full Refund'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
