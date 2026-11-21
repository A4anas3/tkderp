import React, { useState } from 'react';
import { UserX, AlertTriangle } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { studentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function RevokeStudentModal({
  isOpen,
  onClose,
  student,
  onSuccess,
}) {
  const { success, error } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!student) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      error('Please provide a mandatory revocation reason');
      return;
    }

    setSubmitting(true);
    try {
      const res = await studentApi.revoke(student.id, reason.trim());
      success(`Student ${student.name} (${student.student_code}) has been revoked`);
      onClose();
      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err) {
      error(err.message || 'Failed to revoke student');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Revoke Student Admission / Status"
      subtitle="Revoking student deactivates their student profile, cancels all active batch enrollments, and voids outstanding dues"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>Revocation Warning</span>
          </div>
          <p className="text-rose-800">
            You are about to revoke <strong className="text-black">{student.name}</strong> ({student.student_code}).
            All active course/batch enrollments will be automatically cancelled and any Green Card access deactivated.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-black mb-1">
            Mandatory Reason for Revocation <span className="text-rose-600">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Left institute voluntarily due to relocation / non-attendance / disciplinary action"
            rows={3}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-black bg-white focus:outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-600"
            required
            autoFocus
          />
        </div>

        <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} disabled={submitting} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={submitting} icon={UserX} className="w-full sm:w-auto">
            Confirm Revocation
          </Button>
        </div>
      </form>
    </Modal>
  );
}
