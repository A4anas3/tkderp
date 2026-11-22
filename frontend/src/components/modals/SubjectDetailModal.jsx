import React from 'react';
import {
  BookOpen,
  Users,
  CheckCircle2,
  XCircle,
  Award,
  Layers,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';

export default function SubjectDetailModal({
  isOpen,
  onClose,
  subject,
  onToggleRoster,
}) {
  if (!subject) return null;

  // Active status
  const isActive = subject.enrolled_count > 0 || subject.total_booked > 0 || subject.status === 'ACTIVE';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Subject Curriculum & Revenue Overview"
      subtitle={`Subject Code: ${subject.subject_code || 'SUB'}`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* Prominent Active vs Not Active Status Banner */}
        <div
          className={`p-3.5 rounded-lg border flex items-center justify-between ${
            isActive
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-slate-100 border-slate-300 text-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isActive ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-slate-500 shrink-0" />
            )}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">
                Curriculum Status: {isActive ? 'ACTIVE COURSE / SUBJECT' : 'INACTIVE / NO ACTIVE COHORT'}
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                {isActive
                  ? `Active curriculum with ${subject.enrolled_count} active enrolled students in this reporting period`
                  : 'No active enrollments recorded for this subject in the selected period'}
              </div>
            </div>
          </div>
          <Badge variant={isActive ? 'success' : 'neutral'} size="md" className="uppercase font-bold tracking-wide">
            {isActive ? 'ACTIVE' : 'INACTIVE'}
          </Badge>
        </div>

        {/* Bio Card */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-purple-100 text-odoo-700 font-bold flex items-center justify-center text-base border border-odoo-200 shrink-0">
            {subject.subject_code === 'GREEN-CARD' ? (
              <Award className="w-6 h-6 text-purple-600" />
            ) : (
              <BookOpen className="w-6 h-6 text-odoo-600" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-black text-base truncate">{subject.subject_name}</h3>
            <div className="flex items-center gap-2 text-xs text-slate-600 font-medium mt-0.5 font-mono">
              <span>Code: {subject.subject_code}</span>
              <span>•</span>
              <span>Standard Fee: ₹{Number(subject.default_fee || 0).toFixed(2)}/mo</span>
            </div>
          </div>
        </div>

        {/* Revenue KPI Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[11px]">Total Billed</span>
            <span className="font-mono font-bold text-black text-base">
              ₹{Number(subject.total_booked || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[11px]">Cash Realized</span>
            <span className="font-mono font-bold text-emerald-800 text-base">
              ₹{Number(subject.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[11px]">Outstanding Due</span>
            <span className="font-mono font-bold text-rose-700 text-base">
              ₹{Number(subject.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-200">
          <Button size="sm" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>

          {onToggleRoster && (
            <Button
              size="sm"
              variant="info"
              icon={Users}
              className="w-full sm:w-auto"
              onClick={() => {
                onClose();
                onToggleRoster(subject.subject_id);
              }}
            >
              Inspect Student Roster ({subject.enrolled_count})
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
