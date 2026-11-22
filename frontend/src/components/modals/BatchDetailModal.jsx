import React from 'react';
import {
  Users,
  CheckCircle2,
  XCircle,
  Layers,
  GraduationCap,
  MapPin,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';

export default function BatchDetailModal({
  isOpen,
  onClose,
  batch,
  onToggleRoster,
}) {
  if (!batch) return null;

  const isActive = batch.status === 'ACTIVE';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Batch Classroom & Enrollment Overview"
      subtitle={`Batch Code: ${batch.batch_code || 'BCH'}`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* Prominent Active vs Not Active Status Banner */}
        <div
          className={`p-3.5 rounded-lg border flex items-center justify-between ${
            isActive
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isActive ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">
                Batch Status: {isActive ? 'ACTIVE CLASS BATCH' : 'NOT ACTIVE (ARCHIVED / COMPLETED)'}
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                {isActive
                  ? `Batch currently running in ${batch.hall_number || 'Main Hall'} with ${batch.enrolled_count} students`
                  : 'Batch schedule concluded or marked inactive'}
              </div>
            </div>
          </div>
          <Badge variant={isActive ? 'success' : 'danger'} size="md" className="uppercase font-bold tracking-wide">
            {batch.status}
          </Badge>
        </div>

        {/* Bio Card */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-purple-100 text-odoo-700 font-bold flex items-center justify-center text-base border border-odoo-200 shrink-0">
            <Users className="w-6 h-6 text-odoo-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-black text-base truncate">{batch.batch_name}</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-medium mt-0.5">
              <span className="font-mono text-odoo-700 font-bold">{batch.batch_code}</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-700">
                <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                {batch.teacher_name || 'Faculty In-Charge'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-700">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {batch.hall_number || 'Main Hall'}
              </span>
            </div>
          </div>
        </div>

        {/* Revenue KPI Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[11px]">Total Billed</span>
            <span className="font-mono font-bold text-black text-base">
              ₹{Number(batch.total_booked || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[11px]">Cash Realized</span>
            <span className="font-mono font-bold text-emerald-800 text-base">
              ₹{Number(batch.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[11px]">Outstanding Due</span>
            <span className="font-mono font-bold text-rose-700 text-base">
              ₹{Number(batch.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                onToggleRoster(batch.batch_id);
              }}
            >
              Inspect Student Roster ({batch.enrolled_count})
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
