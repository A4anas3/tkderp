import React, { useState } from 'react';
import { Edit3, AlertCircle } from 'lucide-react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';
import { paymentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function EditPaymentModal({
  isOpen,
  onClose,
  payment,
  onSuccess,
}) {
  const { success, error } = useToast();
  const [amount, setAmount] = useState(payment ? String(payment.amount) : '');
  const [paymentMode, setPaymentMode] = useState(payment ? payment.payment_mode : 'CASH');
  const [reference, setReference] = useState(payment ? payment.transaction_reference || '' : '');
  const [notes, setNotes] = useState(payment ? payment.notes || '' : '');
  const [editReason, setEditReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync state if payment changes
  React.useEffect(() => {
    if (payment) {
      setAmount(String(payment.amount));
      setPaymentMode(payment.payment_mode);
      setReference(payment.transaction_reference || '');
      setNotes(payment.notes || '');
      setEditReason('');
    }
  }, [payment]);

  if (!payment) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newAmt = parseFloat(amount);

    if (isNaN(newAmt) || newAmt <= 0) {
      error('Please enter a valid payment amount greater than 0');
      return;
    }

    if (!editReason.trim()) {
      error('Please provide a mandatory reason for editing this payment record');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        amount: newAmt,
        payment_mode: paymentMode,
        transaction_reference: reference.trim() || null,
        notes: notes.trim() || null,
        edit_reason: editReason.trim(),
      };

      const res = await paymentApi.update(payment.id, payload);
      success(`Payment receipt ${res.payment_number} successfully updated!`);

      onClose();
      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err) {
      error(err.message || 'Failed to update payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Payment Record"
      subtitle={`Receipt: ${payment.payment_number} • Student: ${payment.student_name || 'Student'}`}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs flex items-center justify-between">
          <span className="text-slate-600">Original Amount Paid:</span>
          <span className="font-mono font-bold text-black text-sm">
            ₹{Number(payment.amount).toFixed(2)}
          </span>
        </div>

        <Input
          label="Corrected Payment Amount (₹)"
          type="number"
          step="0.01"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />

        <Select
          label="Payment Mode"
          value={paymentMode}
          onChange={(e) => setPaymentMode(e.target.value)}
          options={[
            { value: 'CASH', label: 'Cash Payment' },
            { value: 'UPI', label: 'UPI / QR Code' },
            { value: 'BANK_TRANSFER', label: 'Bank Transfer (NEFT/IMPS)' },
            { value: 'CARD', label: 'Debit / Credit Card' },
            { value: 'OTHER', label: 'Other' },
          ]}
          required
        />

        <Input
          label="Transaction Reference / UTR Number"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. UPI Ref / Bank UTR / Cheque No"
        />

        <Input
          label="Payment Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Paid in cash at reception"
        />

        <div>
          <label className="block text-xs font-semibold text-black mb-1">
            Mandatory Reason for Editing <span className="text-rose-600">*</span>
          </label>
          <textarea
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            placeholder="e.g. Cashier recorded ₹5000 instead of ₹4000; corrected amount after bank verification"
            rows={2}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-black bg-white focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600"
            required
            autoFocus
          />
          <span className="text-[10px] text-slate-500 block mt-0.5">
            This reason will be logged permanently in the system audit trail.
          </span>
        </div>

        <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} disabled={submitting} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} icon={Edit3} className="w-full sm:w-auto">
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
