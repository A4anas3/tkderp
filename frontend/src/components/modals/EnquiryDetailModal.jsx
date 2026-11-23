import React, { useState } from 'react';
import {
  Clock,
  Phone,
  BookOpen,
  Calendar,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  FileText,
  Printer,
  Hash,
  MapPin,
  User
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import DemoPassModal from './DemoPassModal';
import { formatIndianDate } from '../../utils/dateCycleUtils';

export default function EnquiryDetailModal({
  isOpen,
  onClose,
  enquiry,
  onConvertToAdmission,
}) {
  const [passModalOpen, setPassModalOpen] = useState(false);

  if (!enquiry) return null;

  const today = new Date().toISOString().split('T')[0];
  const isConverted = enquiry.status === 'CONVERTED';
  const isInterested = enquiry.status === 'INTERESTED';
  const isActiveDemo = enquiry.status === 'ACTIVE_DEMO';
  const isPending = enquiry.status === 'PENDING';
  const isNotInterested = enquiry.status === 'NOT_INTERESTED';
  const isExpired = enquiry.status === 'EXPIRED' || (isActiveDemo && enquiry.demo_deadline && enquiry.demo_deadline < today);

  const hasCourse = Boolean(enquiry.has_course_purchase);
  const hasStudent = Boolean(enquiry.has_student_admission) || Boolean(enquiry.converted_student_id);

  const statusVariant = hasCourse
    ? 'success'
    : isConverted || hasStudent
    ? 'primary'
    : isInterested
    ? 'success'
    : isActiveDemo && !isExpired
    ? 'primary'
    : isPending
    ? 'warning'
    : isNotInterested
    ? 'neutral'
    : 'danger';

  const demoItems = enquiry.demo_items || [];

  return (
    <>
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
              hasCourse
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : isConverted || hasStudent
                ? 'bg-purple-50 border-odoo-300 text-odoo-900'
                : isInterested
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : isActiveDemo && !isExpired
                ? 'bg-purple-50 border-odoo-300 text-odoo-900'
                : isPending
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : isNotInterested
                ? 'bg-slate-100 border-slate-300 text-slate-800'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {hasCourse || isInterested ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : isConverted || hasStudent || (isActiveDemo && !isExpired) ? (
                <Clock className="w-5 h-5 text-odoo-600 shrink-0" />
              ) : isPending ? (
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              ) : isNotInterested ? (
                <AlertCircle className="w-5 h-5 text-slate-500 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider">
                  Status:{' '}
                  {hasCourse
                    ? 'COURSE ENROLLED (PURCHASED SUBJECTS)'
                    : isConverted || hasStudent
                    ? 'STUDENT ADMITTED (NO COURSE PURCHASED YET)'
                    : isInterested
                    ? '👍 INTERESTED (POST-DEMO)'
                    : isActiveDemo && !isExpired
                    ? 'ACTIVE TRIAL DEMO'
                    : isPending
                    ? 'PENDING DEMO (ENQUIRY ONLY)'
                    : isNotInterested
                    ? 'NOT INTERESTED / DROPPED'
                    : 'EXPIRED / NOT ACTIVE'}
                </div>
                <div className="text-[11px] text-slate-600 font-medium">
                  {hasCourse
                    ? `Student has purchased courses and is enrolled (${enquiry.course_admission_number || 'Billed'})`
                    : isConverted || hasStudent
                    ? `Student registration profile ${enquiry.converted_student_code ? `(${enquiry.converted_student_code})` : ''} created, but no course has been purchased or billed yet.`
                    : isInterested
                    ? 'Student completed trial classes and wants admission'
                    : isActiveDemo && !isExpired
                    ? 'Student is actively attending free trial classes'
                    : isPending
                    ? 'Enquiry taken, trial class demo not yet started'
                    : isNotInterested
                    ? 'Student dropped out or decided not to join'
                    : 'Trial class demo period has expired'}
                </div>
              </div>
            </div>
            <Badge variant={statusVariant} size="md" className="uppercase font-bold tracking-wide">
              {hasCourse
                ? 'Course Enrolled ✓'
                : isConverted || hasStudent
                ? 'Admitted (No Course)'
                : isInterested
                ? '👍 INTERESTED'
                : enquiry.status.replace('_', ' ')}
            </Badge>
          </div>

          {/* Bio Card */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 text-odoo-700 font-bold flex items-center justify-center text-sm border border-odoo-200 shrink-0">
                {enquiry.student_name ? enquiry.student_name.slice(0, 2).toUpperCase() : 'EN'}
              </div>
              <div>
                <h3 className="font-bold text-black text-base">{enquiry.student_name}</h3>
                {enquiry.mobile ? (
                  <a
                    href={`tel:${enquiry.mobile}`}
                    className="font-mono text-xs text-odoo-700 hover:underline font-semibold flex items-center gap-1"
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

          {/* Subject Demo Items with Reference Numbers */}
          {demoItems.length > 0 && (
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-black uppercase tracking-wider flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-odoo-600" />
                  <span>Subject Demos & Tracking Codes ({demoItems.length})</span>
                </span>
                <Button
                  size="xs"
                  variant="indigo"
                  icon={Printer}
                  onClick={() => setPassModalOpen(true)}
                >
                  Print Trial Slip
                </Button>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {demoItems.map((item) => (
                  <div key={item.id} className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-odoo-800 bg-purple-50 border border-odoo-200 px-1.5 py-0.5 rounded text-[11px]">
                          {item.demo_reference_number}
                        </span>
                        <span className="font-bold text-black text-xs">
                          {item.subject_name_snapshot || 'Subject Demo'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                        <span>Faculty: <strong className="text-slate-700">{item.teacher_name_snapshot || 'Assigned'}</strong></span>
                        <span>•</span>
                        <span>Room: <strong className="text-slate-700">{item.hall_number_snapshot || 'Main Hall'}</strong></span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-[11px] text-black block">
                        {formatIndianDate(item.demo_start_date)}
                      </span>
                      <Badge size="xs" variant={item.status === 'CONVERTED' ? 'success' : item.status === 'ATTENDED' ? 'warning' : 'primary'}>
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Demo Period & Deadline Card */}
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-xs font-bold text-black uppercase tracking-wider">
              <Calendar className="w-4 h-4 text-odoo-600" />
              <span>Overall Trial Window</span>
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
          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <Button
              size="sm"
              variant="indigo"
              icon={Printer}
              onClick={() => setPassModalOpen(true)}
            >
              Print Demo Slip
            </Button>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={onClose}>
                Close
              </Button>

              {!hasCourse && onConvertToAdmission && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={UserPlus}
                  onClick={() => {
                    onClose();
                    onConvertToAdmission(enquiry);
                  }}
                >
                  {hasStudent || isConverted ? 'Buy Course / Collect Fees ↗' : 'Admit Student'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Demo Pass Modal */}
      <DemoPassModal
        isOpen={passModalOpen}
        onClose={() => setPassModalOpen(false)}
        enquiry={enquiry}
      />
    </>
  );
}

