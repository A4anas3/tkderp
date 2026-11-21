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
  item,
  onSuccess,
}) {
  const { success, error } = useToast();
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeTarget = item || admission;

  useEffect(() => {
    if (activeTarget) {
      setValidFrom(activeTarget.valid_from || '');
      setValidTo(activeTarget.valid_to || '');
      setNotes('');
    }
  }, [activeTarget, isOpen]);

  if (!activeTarget) return null;

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
      if (item) {
        await admissionApi.updateItemValidity(item.id, {
          valid_from: validFrom,
          valid_to: validTo,
          notes: notes.trim() || undefined,
        });
        success(`Validity dates for ${item.subject_name || item.item_name_snapshot || 'subject'} updated!`);
      } else {
        await admissionApi.updateValidity(admission.id, {
          valid_from: validFrom,
          valid_to: validTo,
          notes: notes.trim() || undefined,
        });
        success('Subject fee validity dates successfully updated!');
      }
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
      title={item ? `Adjust Validity: ${item.subject_name || item.item_name_snapshot}` : "Adjust Course Fee Validity Dates"}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-purple-50 border border-odoo-200 rounded-lg p-3 text-xs text-odoo-900 space-y-1">
          {item ? (
            <>
              <div className="font-bold flex justify-between">
                <span>Subject: {item.subject_name || item.item_name_snapshot}</span>
                <span className="font-mono text-odoo-700">{item.admission_number || ''}</span>
              </div>
              {item.teacher_name && (
                <div className="text-slate-600">
                  Teacher: <strong className="text-black">{item.teacher_name}</strong>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="font-bold">
                Purchase ID: <span className="font-mono">{admission.purchase_transaction_id || admission.admission_number}</span>
              </div>
              <div className="text-slate-600">
                Student: <strong className="text-black">{admission.student_name_snapshot || 'Student'}</strong>
              </div>
            </>
          )}
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
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-odoo-500"
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
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-odoo-500"
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
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-odoo-800 border border-slate-200 transition"
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
            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-odoo-500"
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-slate-200">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" icon={Save} loading={submitting} className="w-full sm:w-auto">
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
