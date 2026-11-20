import React from 'react';
import {
  GraduationCap,
  Phone,
  Mail,
  Calendar,
  Award,
  CheckCircle2,
  XCircle,
  Edit2,
  BookOpen,
  Users
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { formatIndianDate } from '../../utils/dateCycleUtils';

export default function TeacherDetailModal({
  isOpen,
  onClose,
  teacher,
  onEditTeacher,
  onViewRoster,
}) {
  if (!teacher) return null;

  const isActive = teacher.status === 'ACTIVE';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Faculty Profile & Teaching Assignments"
      subtitle={`Teacher Code: ${teacher.teacher_code || 'TCH'}`}
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
                Faculty Status: {isActive ? 'ACTIVE FACULTY MEMBER' : 'INACTIVE / ON LEAVE'}
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                {isActive
                  ? 'Currently assigned to teach batches, subjects, and student cohorts'
                  : 'Faculty is inactive or temporarily suspended'}
              </div>
            </div>
          </div>
          <Badge
            variant={isActive ? 'success' : 'neutral'}
            size="md"
            className="uppercase font-bold tracking-wide"
          >
            {teacher.status}
          </Badge>
        </div>

        {/* Bio Header */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-base border border-indigo-200 shrink-0">
            {teacher.name ? teacher.name.slice(0, 2).toUpperCase() : 'TC'}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-black text-base truncate">{teacher.name}</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-medium mt-0.5">
              <span className="font-semibold text-indigo-700">{teacher.specialization || 'General Faculty'}</span>
              <span>•</span>
              <span className="font-mono text-slate-500">{teacher.teacher_code}</span>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-white p-3 rounded border border-slate-200 flex items-center gap-2.5">
            <Phone className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-[11px] text-slate-500 block">Mobile Contact</span>
              {teacher.mobile ? (
                <a href={`tel:${teacher.mobile}`} className="font-mono font-bold text-black hover:text-indigo-600">
                  {teacher.mobile}
                </a>
              ) : (
                <span className="text-slate-400 italic">None</span>
              )}
            </div>
          </div>

          <div className="bg-white p-3 rounded border border-slate-200 flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-[11px] text-slate-500 block">Email Address</span>
              <span className="font-medium text-black truncate block">
                {teacher.email || '—'}
              </span>
            </div>
          </div>

          <div className="bg-white p-3 rounded border border-slate-200 flex items-center gap-2.5">
            <Award className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-[11px] text-slate-500 block">Qualification</span>
              <span className="font-semibold text-black">
                {teacher.qualification || 'Experienced Faculty'}
              </span>
            </div>
          </div>

          <div className="bg-white p-3 rounded border border-slate-200 flex items-center gap-2.5">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-[11px] text-slate-500 block">Joining Date</span>
              <span className="font-mono font-medium text-black">
                {formatIndianDate(teacher.joining_date)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>

          {onViewRoster && (
            <Button
              size="sm"
              variant="secondary"
              icon={BookOpen}
              onClick={() => {
                onClose();
                onViewRoster(teacher);
              }}
            >
              View Course Enrollments
            </Button>
          )}

          {onEditTeacher && (
            <Button
              size="sm"
              variant="primary"
              icon={Edit2}
              onClick={() => {
                onClose();
                onEditTeacher(teacher);
              }}
            >
              Edit Faculty Profile
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
