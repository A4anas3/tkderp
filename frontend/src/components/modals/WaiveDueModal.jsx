import React, { useState, useEffect } from 'react';
import { Sparkles, AlertTriangle, ShieldCheck, Check, DollarSign } from 'lucide-react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { admissionApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function WaiveDueModal({
  isOpen,
  onClose,
  admission,
  student = null,
  onSuccess,
}) {
  const { success, error } = useToast();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('ALL');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const balanceDue = Number(admission?.balance_due || 0);
  const itemsWithDue = (admission?.items || []).filter(
    (itm) => Number(itm.balance_due || 0) > 0
  );

  useEffect(() => {
    if (admission && isOpen) {
      const due = Number(admission.balance_due || 0);
      setAmount(due > 0 ? String(due) : '0');
      setSelectedItemId('ALL');
      setReason('');
      setConfirmed(false);
    }
  }, [admission, isOpen]);

  if (!admission) return null;

  const handleItemChange = (e) => {
    const itmId = e.target.value;
    setSelectedItemId(itmId);
    if (itmId === 'ALL') {
      setAmount(String(balanceDue));
    } else {
      const itm = itemsWithDue.find((i) => String(i.id) === itmId);
      if (itm) {
        setAmount(String(Number(itm.balance_due || 0)));
      }
    }
  };

  const handleSetFullAmount = () => {
    if (selectedItemId === 'ALL') {
      setAmount(String(balanceDue));
    } else {
      const itm = itemsWithDue.find((i) => String(i.id) === selectedItemId);
      if (itm) {
        setAmount(String(Number(itm.balance_due || 0)));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const waiveAmt = parseFloat(amount);

    if (isNaN(waiveAmt) || waiveAmt <= 0) {
      error('Please enter a valid waiver amount greater than ₹0.00');
      return;
    }

    const maxDueAllowed =
      selectedItemId === 'ALL'
        ? balanceDue
        : Number(
            itemsWithDue.find((i) => String(i.id) === selectedItemId)
              ?.balance_due || balanceDue
          );

    if (waiveAmt > maxDueAllowed) {
      error(`Waiver amount ₹${waiveAmt.toFixed(2)} cannot exceed outstanding due ₹${maxDueAllowed.toFixed(2)}`);
      return;
    }

    if (!reason.trim()) {
      error('Mandatory: Please provide a specific reason for waiving this fee due');
      return;
    }

    if (!confirmed) {
      error('Please check the confirmation box to authorize this waiver');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        reason: reason.trim(),
        amount: waiveAmt,
        item_id: selectedItemId !== 'ALL' ? selectedItemId : null,
      };

      const res = await admissionApi.waiveDue(admission.id, payload);
      success(
        `Fee due of ₹${waiveAmt.toFixed(2)} waived (forgiven) successfully for ${
          admission.student_name_snapshot || student?.name || 'student'
        }!`
      );

      onClose();
      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err) {
      error(err.message || 'Failed to waive fee due');
    } finally {
      setSubmitting(false);
    }
  };

  const studentName =
    admission.student_name_snapshot ||
    admission.student?.name ||
    student?.name ||
    'Student';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Waive Pending Fee Due (Maaf Karein)"
      subtitle={`Admission: ${admission.admission_number} • Student: ${studentName}`}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Outstanding Due Highlight Banner */}
        <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-3.5 flex items-start gap-3 shadow-xs">
          <div className="w-9 h-9 rounded-lg bg-amber-200 border border-amber-400 flex items-center justify-center shrink-0 mt-0.5 text-amber-900">
            <Sparkles className="w-5 h-5 text-amber-900" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-amber-950 uppercase tracking-wider">
                Current Outstanding Balance Due
              </span>
              <Badge variant="warning" size="xs">
                Admin Action
              </Badge>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-950 font-mono mt-0.5">
              ₹{balanceDue.toFixed(2)}
            </div>
            <p className="text-[11px] text-amber-900 mt-1 leading-snug">
              Total Course Fee: <strong className="text-black font-mono">₹{Number(admission.total_payable || 0).toFixed(2)}</strong> | Paid: <strong className="text-black font-mono">₹{Number(admission.amount_paid || 0).toFixed(2)}</strong>
            </p>
          </div>
        </div>

        {/* Item Selector if multi-subject with dues */}
        {itemsWithDue.length > 1 && (
          <div>
            <label className="block text-[11px] font-bold text-black uppercase tracking-wider mb-1">
              Apply Waiver To Subject Line
            </label>
            <select
              value={selectedItemId}
              onChange={handleItemChange}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-black font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">All Enrolled Subjects (Proportional Full Slip: ₹{balanceDue.toFixed(2)})</option>
              {itemsWithDue.map((itm) => (
                <option key={itm.id} value={itm.id}>
                  {itm.item_name_snapshot} — Due: ₹{Number(itm.balance_due).toFixed(2)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Amount to Waive */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-bold text-black uppercase tracking-wider">
              Amount to Waive / Forgive (₹) *
            </label>
            <button
              type="button"
              onClick={handleSetFullAmount}
              className="text-[11px] font-bold text-amber-800 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded border border-amber-300 transition"
            >
              Full Due (₹{selectedItemId === 'ALL' ? balanceDue.toFixed(0) : Number(itemsWithDue.find((i) => String(i.id) === selectedItemId)?.balance_due || balanceDue).toFixed(0)})
            </button>
          </div>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            max={balanceDue}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter waiver amount"
            required
            className="text-sm font-mono font-bold text-black"
          />
        </div>

        {/* Reason Field */}
        <div>
          <label className="block text-[11px] font-bold text-black uppercase tracking-wider mb-1">
            Reason for Waiver (Audit Logged) *
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Administrative fee waiver granted due to financial hardship; management scholarship; director concession..."
            required
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-black font-normal focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-slate-400"
          />
          <span className="text-[10px] text-slate-700 block mt-0.5">
            This reason will be permanently recorded in the financial transaction history and the institution audit trail.
          </span>
        </div>

        {/* Irreversible Action Warning & Confirmation Step */}
        <div className="bg-slate-50 border border-slate-300 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-start gap-2 text-slate-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-black text-black text-xs block">
                Administrative Confirmation Step
              </span>
              <p className="text-[11px] text-slate-800 leading-normal font-normal">
                Waiving this fee due will zero out the outstanding balance, generate an official <strong className="text-black">WAIVER</strong> ledger transaction, update the fee slips with the waived amount, and record your identity, timestamp, and justification into the Audit Log.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2.5 p-2 bg-white rounded-lg border border-slate-300 cursor-pointer hover:bg-amber-50/50 transition">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500 cursor-pointer"
            />
            <span className="text-[11px] font-bold text-black leading-tight select-none">
              I confirm that I am authorized to waive ₹{Number(amount || 0).toFixed(2)} of pending fees for this student.
            </span>
          </label>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            size="sm"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="warning"
            icon={ShieldCheck}
            loading={submitting}
            disabled={!confirmed || !reason.trim() || !amount || Number(amount) <= 0}
            size="sm"
            className="bg-amber-500 hover:bg-amber-600 text-black font-bold border-amber-600"
          >
            Confirm & Waive Due (Maaf Karein)
          </Button>
        </div>
      </form>
    </Modal>
  );
}
