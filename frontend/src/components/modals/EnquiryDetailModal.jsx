import React from 'react';
import {
  Clock,
  Phone,
  BookOpen,
  Calendar,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  FileText
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { formatIndianDate } from '../../utils/dateCycleUtils';

export default function EnquiryDetailModal({
  isOpen,
  onClose,
  enquiry,
  onConvertToAdmission,
}) {
  if (!enquiry) return null;

  const today = new Date().toISOString().split('T')[0];
  const isConverted = enquiry.status === 'CONVERTED';
  const isActiveDemo = enquiry.status === 'ACTIVE_DEMO';
  const isPending = enquiry.status === 'PENDING';
  const isExpired = enquiry.status === 'EXPIRED' || (isActiveDemo && enquiry.demo_deadline && enquiry.demo_deadline < today);

  const statusVariant = isConverted
    ? 'success'
    : isActiveDemo && !isExpired
    ? 'primary'
    : isPending
    ? 'warning'
    : 'danger';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Student Enquiry & Trial Demo Details"
      subtitle={`Enquiry ID: ${enquiry.id.slice(0, 8)}...`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* Prominent Active vs Not Active Status Banner */}
        <div
          className={`p-3.5 rounded-lg border flex items-center justify-between ${
            isConverted
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : isActiveDemo && !isExpired
              ? 'bg-indigo-50 border-indigo-300 text-indigo-950'
              : isPending
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isConverted ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : isActiveDemo && !isExpired ? (
              <Clock className="w-5 h-5 text-indigo-600 shrink-0" />
            ) : isPending ? (
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">
                Status:{' '}
                {isConverted
                  ? 'CONVERTED (REGISTERED STUDENT)'
                  : isActiveDemo && !isExpired
                  ? 'ACTIVE TRIAL DEMO'
                  : isPending
                  ? 'PENDING DEMO (ENQUIRY ONLY)'
                  : 'EXPIRED / NOT ACTIVE'}
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                {isConverted
                  ? 'Student converted into an enrolled course admission'
                  : isActiveDemo && !isExpired
                  ? 'Student is actively attending free trial classes'
                  : isPending
                  ? 'Enquiry taken, trial class demo not yet started'
                  : 'Trial class demo period has expired'}
              </div>
            </div>
          </div>
          <Badge variant={statusVariant} size="md" className="uppercase font-bold tracking-wide">
            {enquiry.status.replace('_', ' ')}
          </Badge>
        </div>

        {/* Bio Card */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-sm border border-indigo-200 shrink-0">
              {enquiry.student_name ? enquiry.student_name.slice(0, 2).toUpperCase() : 'EN'}
            </div>
            <div>
              <h3 className="font-bold text-black text-base">{enquiry.student_name}</h3>
              {enquiry.mobile ? (
                <a
                  href={`tel:${enquiry.mobile}`}
                  className="font-mono text-xs text-indigo-700 hover:underline font-semibold flex items-center gap-1"
                >
                  <Phone className="w-3 h-3 text-slate-400" />
                  {enquiry.mobile}
                </a>
              ) : (
                <span className="text-slate-400 text-xs italic">No mobile phone provided</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200">
            <div>
              <span className="text-[11px] text-slate-500 block">Interested Subject / Class</span>
              <span className="font-semibold text-black">
                {enquiry.interested_subject || 'General Enquiry'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block">Purpose / Target</span>
              <span className="font-medium text-slate-800">
                {enquiry.purpose || 'Coaching Admission'}
              </span>
            </div>
          </div>
        </div>

        {/* Demo Period & Deadline Card */}
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-2 text-xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-black uppercase tracking-wider">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Trial Demo Class Window</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <div className="bg-slate-50 p-2 rounded border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Demo Start</span>
              <span className="font-mono font-bold text-black">
                {formatIndianDate(enquiry.demo_start_date)}
              </span>
            </div>

            <div className="bg-slate-50 p-2 rounded border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Duration</span>
              <span className="font-semibold text-black">
                {enquiry.demo_duration_days || 3} Days Trial
              </span>
            </div>

            <div className="bg-slate-50 p-2 rounded border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Demo Deadline</span>
              <span className="font-mono font-bold text-black">
                {formatIndianDate(enquiry.demo_deadline)}
              </span>
            </div>
          </div>
        </div>

        {/* Internal Notes */}
        {enquiry.notes && (
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
            <span className="font-bold text-black flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Internal Notes:</span>
            </span>
            <p className="text-slate-700 whitespace-pre-wrap">{enquiry.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>

          {!isConverted && onConvertToAdmission && (
            <Button
              size="sm"
              variant="primary"
              icon={UserPlus}
              onClick={() => {
                onClose();
                onConvertToAdmission(enquiry);
              }}
            >
              Admit Student (Convert to Admission)
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
