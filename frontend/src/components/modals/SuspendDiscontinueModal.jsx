import React, { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { PauseCircle, StopCircle, AlertTriangle } from 'lucide-react';
import { admissionApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function SuspendDiscontinueModal({
  isOpen,
  onClose,
  admission,
  item,
  mode = 'SUSPEND', // 'SUSPEND' | 'DISCONTINUE'
  onSuccess,
}) {
  const { success, error } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeTarget = item || admission;
  if (!activeTarget) return null;

  const isSuspend = mode === 'SUSPEND';
  const targetName = item ? (item.subject_name || item.item_name_snapshot) : (admission.purchase_transaction_id || admission.admission_number);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (item) {
        if (isSuspend) {
          await admissionApi.suspendItem(item.id, { reason: reason.trim() || undefined });
          success(`Subject "${targetName}" temporarily suspended.`);
        } else {
          await admissionApi.discontinueItem(item.id, { reason: reason.trim() || undefined });
          success(`Subject "${targetName}" marked as discontinued.`);
        }
      } else {
        if (isSuspend) {
          await admissionApi.suspend(admission.id, { reason: reason.trim() || undefined });
          success('Subject enrollment temporarily suspended.');
        } else {
          await admissionApi.discontinue(admission.id, { reason: reason.trim() || undefined });
          success('Subject enrollment marked as discontinued.');
        }
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      error(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isSuspend ? `Suspend Subject: ${targetName}` : `Discontinue Subject: ${targetName}`}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className={`p-3 rounded-lg border text-xs space-y-1 ${
          isSuspend ? 'bg-amber-50 border-amber-200 text-amber-950' : 'bg-rose-50 border-rose-200 text-rose-950'
        }`}>
          <div className="font-bold flex items-center gap-1.5">
            {isSuspend ? <PauseCircle className="w-4 h-4 text-amber-600" /> : <StopCircle className="w-4 h-4 text-rose-600" />}
            <span>{isSuspend ? 'Temporary Suspension' : 'Discontinue Subject'}</span>
          </div>
          <p className="text-slate-600">
            {isSuspend
              ? 'This will pause attendance for this subject and move it to the historical/suspended tab until resumed.'
              : 'The student will stop attending this subject. Invoices, receipts, and past marks remain in historical records.'}
          </p>
        </div>

        <div className="text-xs">
          <label className="block text-slate-700 font-bold mb-1">
            Reason / Counselor Notes <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <textarea
            rows={3}
            placeholder={isSuspend ? 'e.g., Student unwell, exam break, resuming next month' : 'e.g., Relocated to another city, timetable clash'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-slate-300 rounded p-2 text-xs text-black focus:outline-none focus:ring-1 focus:ring-odoo-500"
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-slate-200">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            type="submit"
            variant={isSuspend ? 'warning' : 'danger'}
            size="sm"
            loading={submitting}
            className="w-full sm:w-auto"
          >
            {isSuspend ? 'Confirm Suspension' : 'Confirm Discontinue'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
