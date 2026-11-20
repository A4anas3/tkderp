import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { Calendar, Save, AlertCircle } from 'lucide-react';
import { admissionApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function EditValidityModal({
  isOpen,
  onClose,
  admission,
  onSuccess,
}) {
  const { success, error } = useToast();
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (admission) {
      setValidFrom(admission.valid_from || '');
      setValidTo(admission.valid_to || '');
      setNotes('');
    }
  }, [admission, isOpen]);

  if (!admission) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validFrom || !validTo) {
      error('Please provide both Start and End validity dates');
      return;
    }
    if (validTo < validFrom) {
      error('End date cannot be earlier than Start date');
      return;
    }

    setSubmitting(true);
    try {
      await admissionApi.updateValidity(admission.id, {
        valid_from: validFrom,
        valid_to: validTo,
        notes: notes.trim() || undefined,
      });
      success('Subject fee validity dates successfully updated!');
      onSuccess?.();
      onClose();
    } catch (err) {
      error(err.message || 'Failed to update validity dates');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Subject Fee Validity Dates"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-950 space-y-1">
          <div className="font-bold">
            Purchase ID: <span className="font-mono">{admission.purchase_transaction_id || admission.admission_number}</span>
          </div>
          <div className="text-slate-600">
            Student: <strong className="text-black">{admission.student_name_snapshot || 'Student'}</strong>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Valid From (Start Date) <span className="text-rose-600">*</span>
            </label>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Valid To (End Date) <span className="text-rose-600">*</span>
            </label>
            <input
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-indigo-500"
              required
            />
          </div>
        </div>

        {/* Quick Date Extender Chips */}
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Quick Extend From Start Date:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[15, 30, 60, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  if (!validFrom) return;
                  const d = new Date(validFrom);
                  d.setDate(d.getDate() + days);
                  setValidTo(d.toISOString().split('T')[0]);
                }}
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 border border-slate-200 transition"
              >
                +{days} Days
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-slate-700 font-bold mb-1 text-xs">
            Adjustment Reason / Notes (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g., Medical leave extension, holiday rollover"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" icon={Save} loading={submitting}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
