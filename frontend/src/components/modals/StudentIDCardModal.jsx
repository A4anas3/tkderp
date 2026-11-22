import React from 'react';
import { Printer, X, ShieldCheck, Calendar, BookOpen, AlertCircle, Phone, User } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Avatar from '../common/Avatar';
import {
  extractActiveCourses,
  buildWhatsAppShareUrl,
  formatValidityPeriod,
} from '../../utils/idCardHelpers';

// Official WhatsApp icon
function WhatsAppIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function StudentIDCardModal({
  isOpen,
  onClose,
  student,
  enrollmentData,
  admissionNumberOverride = null,
}) {
  if (!isOpen || !student) return null;

  // Extract all active courses
  const activeCourses = extractActiveCourses(student, enrollmentData);

  // Determine admission number to show and verify
  const admissionNo =
    admissionNumberOverride ||
    student.latest_admission_number ||
    activeCourses[0]?.admission_number ||
    student.student_code;

  // Online public ID card page URL for QR code (pre-filled with admission number)
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicIdCardUrl = `${origin}/id-card/${encodeURIComponent(admissionNo)}`;
  const verifyUrl = publicIdCardUrl;

  // WhatsApp share link
  const whatsAppUrl = buildWhatsAppShareUrl({
    student,
    admissionNo,
    activeCourses,
    verifyUrl,
  });

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    if (whatsAppUrl) {
      window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const hasPhoto = Boolean(student.photo_url);
  const hasMobile = Boolean(student?.mobile && String(student.mobile).trim());

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="">
      <div className="space-y-4 font-sans">
        {/* Top Controls Bar (Hidden during print) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 no-print">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-black">Student Identity Card</span>
              <Badge variant="success" size="xs">
                Official Credential
              </Badge>
            </div>
            <p className="text-xs text-slate-700 font-medium">
              Printable ID card with verified course validity and instant verification QR code.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* WhatsApp Share Button */}
            <button
              onClick={handleWhatsAppShare}
              disabled={!hasMobile}
              title={
                hasMobile
                  ? `Share card details with ${student.mobile} on WhatsApp`
                  : 'Student has no mobile number recorded'
              }
              className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors shadow-2xs ${
                hasMobile
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              <WhatsAppIcon className="w-4 h-4 shrink-0 text-white" />
              <span>WhatsApp Share</span>
            </button>

            {/* Print Button */}
            <Button
              variant="primary"
              size="xs"
              icon={Printer}
              onClick={handlePrint}
              className="min-h-[34px] font-bold"
            >
              Print ID Card
            </Button>
          </div>
        </div>

        {/* Printable Card Area */}
        <div className="printable-id-card-wrapper py-2 flex justify-center">
          <div
            id="printable-id-card"
            className="printable-id-card w-full max-w-[440px] bg-white border-2 border-black rounded-xl overflow-hidden shadow-md text-black"
          >
            {/* Card Header: Institute Emblem & Details */}
            <div className="bg-slate-900 text-white px-4 py-3.5 text-center relative border-b-2 border-amber-500">
              <div className="flex items-center justify-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
                <h1 className="text-sm sm:text-base font-black tracking-wider uppercase text-white">
                  THAKURDWARA COACHING INSTITUTE
                </h1>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-200 font-medium tracking-tight mt-0.5">
                Civil Lines, Thakurdwara (U.P.) • ISO 9001:2015 Certified
              </p>
              <div className="mt-1.5 inline-block">
                <span className="bg-amber-400 text-slate-950 font-black text-[10px] tracking-widest uppercase px-3 py-0.5 rounded-full shadow-2xs">
                  STUDENT IDENTITY CARD
                </span>
              </div>
            </div>

            {/* Card Body */}
            <div className="p-4 space-y-3.5 bg-white">
              {/* Student Identification Row: Photo + Primary Metadata */}
              <div className="flex items-start gap-3.5 border-b border-slate-200 pb-3">
                {/* Photo Frame */}
                <div className="w-24 h-28 sm:w-28 sm:h-32 border-2 border-black rounded-lg overflow-hidden bg-slate-100 shrink-0 shadow-xs flex items-center justify-center">
                  {hasPhoto ? (
                    <img
                      src={student.photo_url}
                      alt={student.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-700 p-2 text-center h-full">
                      <User className="w-8 h-8 text-slate-500 mb-1" />
                      <span className="text-[10px] font-bold uppercase leading-tight text-black">
                        {student.name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info Column */}
                <div className="min-w-0 flex-1 space-y-1 text-xs">
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-black uppercase leading-tight truncate">
                      {student.name}
                    </h2>
                    {student.father_name && (
                      <p className="text-[11px] text-zinc-950 font-semibold truncate">
                        S/D of: {student.father_name}
                      </p>
                    )}
                  </div>

                  <div className="pt-0.5 space-y-1">
                    {/* Student ID */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-800 uppercase w-20 shrink-0">
                        Student ID:
                      </span>
                      <span className="font-mono font-black text-black bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300">
                        {student.student_code}
                      </span>
                    </div>

                    {/* Admission Number */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-800 uppercase w-20 shrink-0">
                        Admission No:
                      </span>
                      <span className="font-mono font-black text-black bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                        {admissionNo}
                      </span>
                    </div>

                    {/* Mobile */}
                    {student.mobile && (
                      <div className="flex items-center gap-1.5 text-zinc-950 font-semibold">
                        <Phone className="w-3 h-3 text-slate-700 shrink-0" />
                        <span>{student.mobile}</span>
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="pt-0.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                        ● {student.status || 'ACTIVE'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Enrolled Active Courses Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-slate-300 pb-1">
                  <span className="text-[11px] font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-odoo-800 shrink-0" />
                    Enrolled Active Courses ({activeCourses.length})
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    Active & Valid
                  </span>
                </div>

                {activeCourses.length === 0 ? (
                  <div className="p-2.5 rounded border border-dashed border-slate-300 bg-slate-50 text-center">
                    <p className="text-xs font-semibold text-slate-700">
                      No active courses currently enrolled.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-0.5">
                    {activeCourses.map((course, idx) => (
                      <div
                        key={course.id || idx}
                        className="p-2 bg-slate-50 rounded-lg border border-slate-300 text-xs space-y-1"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-bold text-black leading-tight flex-1">
                            {course.course_name}
                          </span>
                          {course.batch_name && (
                            <span className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-slate-300 text-slate-800 shrink-0">
                              {course.batch_name}
                            </span>
                          )}
                        </div>

                        {/* Validity Period */}
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                          <span className="font-bold text-odoo-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-odoo-700 shrink-0" />
                            {formatValidityPeriod(course.valid_from, course.valid_to)}
                          </span>

                          {course.days_remaining !== null && course.days_remaining !== undefined && (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                course.days_remaining <= 5
                                  ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                  : 'bg-slate-200 text-slate-900'
                              }`}
                            >
                              {course.days_remaining}d remaining
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Card Footer: Verification QR Code & Official Signatory */}
              <div className="pt-2 border-t-2 border-black flex items-center justify-between gap-3">
                {/* QR Code Verifier */}
                <div className="flex items-center gap-2.5">
                  <div className="p-1 bg-white border border-black rounded shadow-2xs shrink-0">
                    <QRCodeSVG
                      value={verifyUrl}
                      size={76}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                  <div className="space-y-0.5 text-[9px] sm:text-[10px] leading-tight">
                    <p className="font-black text-black uppercase">SCAN FOR ID CARD</p>
                    <p className="text-slate-700 font-medium">Instant Online Credential</p>
                    <p className="font-mono text-[8px] text-slate-600 break-all max-w-[130px]">
                      /id-card/{admissionNo}
                    </p>
                  </div>
                </div>

                {/* Signatory & Seal */}
                <div className="text-right space-y-1">
                  <div className="w-24 border-b border-black inline-block pb-0.5">
                    <span className="font-serif italic text-[11px] text-slate-700">Auth Sign</span>
                  </div>
                  <p className="text-[9px] font-black uppercase text-black tracking-wider">
                    Authorized Signatory
                  </p>
                  <p className="text-[8px] text-slate-600 font-medium">
                    Thakurdwara ERP Verified
                  </p>
                </div>
              </div>

              {/* Bottom Instructions Notice */}
              <div className="text-[8px] sm:text-[9px] text-center text-slate-600 border-t border-slate-200 pt-1">
                Property of Thakurdwara Coaching Institute • Non-Transferable • Carry daily for class entry
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Close Button (no-print) */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 no-print">
          <Button variant="secondary" onClick={onClose} size="sm">
            Close
          </Button>
          <Button variant="primary" icon={Printer} onClick={handlePrint} size="sm">
            Print Card
          </Button>
        </div>
      </div>
    </Modal>
  );
}
