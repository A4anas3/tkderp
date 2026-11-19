import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';
import { admissionApi, paymentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function QuickPaymentModal({
  isOpen,
  onClose,
  initialAdmissionId,
  onPaymentSuccess,
}) {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [admissions, setAdmissions] = useState([]);
  const [selectedAdmissionId, setSelectedAdmissionId] = useState(initialAdmissionId || '');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch pending / unpaid admissions
  useEffect(() => {
    if (isOpen) {
      const fetchDueAdmissions = async () => {
        setLoading(true);
        try {
          const res = await admissionApi.list({ page: 1, page_size: 50 });
          // Filter admissions that have balance_due > 0
          const dues = (res.items || []).filter(
            (a) => Number(a.balance_due) > 0 && a.status === 'ACTIVE'
          );
          setAdmissions(dues);

          if (initialAdmissionId) {
            setSelectedAdmissionId(initialAdmissionId);
            const found = dues.find((a) => a.id === initialAdmissionId);
            if (found) setAmount(Number(found.balance_due).toFixed(2));
          } else if (dues.length > 0) {
            setSelectedAdmissionId(dues[0].id);
            setAmount(Number(dues[0].balance_due).toFixed(2));
          }
        } catch (err) {
          error(err.message || 'Failed to load unpaid admissions');
        } finally {
          setLoading(false);
        }
      };
      fetchDueAdmissions();
    }
  }, [isOpen, initialAdmissionId]);

  const handleAdmissionChange = (id) => {
    setSelectedAdmissionId(id);
    const found = admissions.find((a) => a.id === id);
    if (found) {
      setAmount(Number(found.balance_due).toFixed(2));
    }
  };

  const selectedAdmission = admissions.find((a) => a.id === selectedAdmissionId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAdmissionId) {
      error('Please select an admission');
      return;
    }
    const payAmt = parseFloat(amount);
    if (isNaN(payAmt) || payAmt <= 0) {
      error('Please enter a valid payment amount greater than zero');
      return;
    }
    if (selectedAdmission && payAmt > Number(selectedAdmission.balance_due) + 0.01) {
      error(`Amount cannot exceed remaining balance of ₹${Number(selectedAdmission.balance_due).toFixed(2)}`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        admission_id: selectedAdmissionId,
        amount: payAmt,
        payment_mode: paymentMode,
        transaction_reference: transactionRef.trim() || null,
        notes: notes.trim() || null,
      };

      const res = await paymentApi.create(payload);
      success(`Payment recorded successfully! Receipt: ${res.payment_number}`);

      // Fetch official receipt
      const receipt = await paymentApi.getReceipt(res.id);

      if (onPaymentSuccess) {
        onPaymentSuccess(receipt);
      }
      onClose();
    } catch (err) {
      error(err.message || 'Failed to process payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Collect Fee Payment"
      subtitle="Record manual payment (Cash, UPI, Bank Transfer) with proportional allocation"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-500">
            Loading pending fee records...
          </div>
        ) : admissions.length === 0 ? (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-md text-xs">
            No course purchases with pending fee balances found.
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-black mb-1">
                Select Course Purchase (Txn ID) <span className="text-rose-600">*</span>
              </label>
              <select
                value={selectedAdmissionId}
                onChange={(e) => handleAdmissionChange(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-sm"
              >
                {admissions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.purchase_transaction_id || a.admission_number} — {a.student_name_snapshot} (Due: ₹
                    {Number(a.balance_due).toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            {selectedAdmission && (
              <div className="bg-slate-50 border border-slate-200 rounded p-2.5 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Student:</span>
                  <span className="font-bold text-black">
                    {selectedAdmission.student_name_snapshot}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Billed Fee:</span>
                  <span className="font-mono text-black font-semibold">
                    ₹{Number(selectedAdmission.total_payable).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-rose-700">
                  <span>Current Outstanding Due:</span>
                  <span className="font-mono">
                    ₹{Number(selectedAdmission.balance_due).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Amount to Collect (₹)"
                type="number"
                step="0.01"
                min="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1000"
              />

              <Select
                label="Payment Mode"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                options={[
                  { value: 'CASH', label: 'Cash' },
                  { value: 'UPI', label: 'UPI / QR' },
                  { value: 'BANK_TRANSFER', label: 'Bank Transfer (NEFT/IMPS)' },
                  { value: 'CARD', label: 'Debit / Credit Card' },
                  { value: 'OTHER', label: 'Other' },
                ]}
              />
            </div>

            {paymentMode !== 'CASH' && (
              <Input
                label="Transaction / Reference Ref (Optional)"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="e.g. UPI Ref / UTR / Cheque No"
              />
            )}

            <Input
              label="Payment Notes (Optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Installment 1 / Paid in person"
            />

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
              <Button variant="secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="success" loading={submitting}>
                Record Payment
              </Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
