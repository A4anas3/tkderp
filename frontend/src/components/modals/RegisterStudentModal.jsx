import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  User,
  Phone,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { formatIndianDate } from '../../utils/dateCycleUtils';

export default function RegisterStudentModal({
  isOpen,
  onClose,
  enquiry,
  resultData,
  onSelectStudent,
  submitting = false
}) {
  const navigate = useNavigate();

  if (!isOpen || !resultData) return null;

  const isMultipleMatches = Boolean(resultData.multiple_matches);
  const isAlreadyRegistered = Boolean(resultData.already_registered);
  const matches = resultData.matches || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isMultipleMatches
          ? 'Multiple Matching Students Found'
          : isAlreadyRegistered
          ? 'Student Already Registered'
          : 'Student Registration Result'
      }
      subtitle={
        enquiry
          ? `Enquiry for ${enquiry.student_name} • Phone: ${enquiry.mobile || 'N/A'}`
          : ''
      }
      maxWidth={isMultipleMatches ? 'max-w-2xl' : 'max-w-lg'}
    >
      <div className="space-y-4 text-xs">
        {/* CASE 1: Multiple Students Found matching this phone number */}
        {isMultipleMatches && (
          <div className="space-y-3">
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 text-xs">
                  Several students ({matches.length}) share this phone number.
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Matches were found on the normalised 10-digit mobile number ({enquiry?.mobile}).
                  Please pick the existing profile to link this enquiry to, or create a brand-new profile.
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
              <div className="bg-slate-100 px-3 py-2 font-semibold text-slate-700 text-[11px] grid grid-cols-12 gap-2">
                <span className="col-span-3">Code / ID</span>
                <span className="col-span-4">Student Name</span>
                <span className="col-span-3">Father / Mobile</span>
                <span className="col-span-2 text-right">Action</span>
              </div>

              {matches.map((m) => (
                <div
                  key={m.id}
                  className="px-3 py-2.5 hover:bg-slate-50 transition flex flex-col sm:grid sm:grid-cols-12 gap-2 items-start sm:items-center text-xs"
                >
                  <div className="col-span-3">
                    <span className="font-mono font-bold text-odoo-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 block w-fit">
                      {m.student_code}
                    </span>
                    {m.registration_date && (
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Reg: {formatIndianDate(m.registration_date)}
                      </span>
                    )}
                  </div>

                  <div className="col-span-4 font-bold text-black flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{m.name}</span>
                  </div>

                  <div className="col-span-3 text-[11px] text-slate-600">
                    <div className="truncate">{m.father_name || 'N/A'}</div>
                    <div className="font-mono text-slate-500 text-[10px]">{m.mobile || ''}</div>
                  </div>

                  <div className="col-span-2 text-right w-full sm:w-auto">
                    <Button
                      size="xs"
                      variant="primary"
                      disabled={submitting}
                      onClick={() => onSelectStudent && onSelectStudent(m.id)}
                      title="Link enquiry to this student profile"
                      className="w-full sm:w-auto"
                    >
                      Select
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-100">
              <Button
                type="button"
                variant="neutral"
                size="xs"
                disabled={submitting}
                onClick={() => onSelectStudent && onSelectStudent(null, true)}
                title="Create a new student with this phone number"
              >
                None of these (Register New Student)
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* CASE 2: Single Match Found & Linked (Already Registered) */}
        {!isMultipleMatches && isAlreadyRegistered && (
          <div className="space-y-4">
            <div className="p-3.5 bg-blue-50 border border-blue-300 rounded-lg flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-blue-950 text-sm">
                  Already registered with student code {resultData.student_code}
                </h4>
                <p className="text-xs text-blue-800 mt-1">
                  An existing student profile was matched on the normalised 10-digit mobile number ({resultData.mobile || enquiry?.mobile}).
                  No duplicate student was created — this enquiry has been linked to the existing profile.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-semibold uppercase">Student Profile</span>
                <span className="font-mono font-bold text-odoo-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  {resultData.student_code}
                </span>
              </div>
              <div className="text-sm font-bold text-black">
                {resultData.student_name || enquiry?.student_name}
              </div>
              {resultData.mobile && (
                <div className="text-xs text-slate-600 font-mono">
                  Phone: {resultData.mobile}
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={ExternalLink}
                onClick={() => {
                  onClose();
                  if (resultData.student_id) {
                    navigate(`/students/${resultData.student_id}`);
                  }
                }}
              >
                View Existing Profile ↗
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="emerald"
                  size="sm"
                  icon={ArrowRight}
                  onClick={() => {
                    onClose();
                    navigate(
                      `/enrollments/new?enquiry_id=${enquiry.id}&student_id=${resultData.student_id}&name=${encodeURIComponent(
                        resultData.student_name || enquiry.student_name
                      )}&mobile=${encodeURIComponent(resultData.mobile || enquiry.mobile || '')}&auto_register=1`
                    );
                  }}
                >
                  Buy Course ↗
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onClose}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* CASE 3: Brand New Student Created */}
        {!isMultipleMatches && !isAlreadyRegistered && resultData.student_code && (
          <div className="space-y-4">
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-lg flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-emerald-950 text-sm">
                  Student Registered Successfully
                </h4>
                <p className="text-xs text-emerald-800 mt-1">
                  Pre-filled student profile created with code{' '}
                  <span className="font-mono font-bold">{resultData.student_code}</span> and linked to this enquiry.
                  Demo status remains active (not converted until course purchase).
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-semibold uppercase">Student Profile</span>
                <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {resultData.student_code}
                </span>
              </div>
              <div className="text-sm font-bold text-black">
                {resultData.student_name || enquiry?.student_name}
              </div>
              {resultData.mobile && (
                <div className="text-xs text-slate-600 font-mono">
                  Phone: {resultData.mobile}
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={ExternalLink}
                onClick={() => {
                  onClose();
                  if (resultData.student_id) {
                    navigate(`/students/${resultData.student_id}`);
                  }
                }}
              >
                View Student Profile ↗
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="emerald"
                  size="sm"
                  icon={ArrowRight}
                  onClick={() => {
                    onClose();
                    navigate(
                      `/enrollments/new?enquiry_id=${enquiry.id}&student_id=${resultData.student_id}&name=${encodeURIComponent(
                        resultData.student_name || enquiry.student_name
                      )}&mobile=${encodeURIComponent(resultData.mobile || enquiry.mobile || '')}&auto_register=1`
                    );
                  }}
                >
                  Buy Course ↗
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onClose}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
