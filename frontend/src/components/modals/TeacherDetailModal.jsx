import React from 'react';
import { useNavigate } from 'react-router-dom';
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
  Users,
  ExternalLink,
  Wallet
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Avatar from '../common/Avatar';
import { formatIndianDate } from '../../utils/dateCycleUtils';

export default function TeacherDetailModal({
  isOpen,
  onClose,
  teacher,
  onEditTeacher,
  onViewRoster,
}) {
  const navigate = useNavigate();
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
                  ? 'Currently assigned to teach subjects and student cohorts'
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
          <Avatar
            src={teacher.photo_url}
            name={teacher.name}
            size="lg"
            status={teacher.status}
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-black text-base truncate">{teacher.name}</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-medium mt-0.5">
              <span className="font-semibold text-odoo-700">{teacher.specialization || 'General Faculty'}</span>
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
                <a href={`tel:${teacher.mobile}`} className="font-mono font-bold text-black hover:text-odoo-600">
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

          <div className="bg-white p-3 rounded border border-slate-200 flex items-center gap-2.5 sm:col-span-2">
            <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="text-[11px] text-slate-500 block">Monthly Salary</span>
              <span className="font-mono font-bold text-black">
                {teacher.monthly_salary !== null && teacher.monthly_salary !== undefined
                  ? `₹${Number(teacher.monthly_salary).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : 'Not set'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-200">
          <Button size="sm" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>

          <Button
            size="sm"
            variant="primary"
            icon={ExternalLink}
            className="w-full sm:w-auto"
            onClick={() => {
              onClose();
              navigate(`/teachers/${teacher.id || teacher.teacher_id}`);
            }}
          >
            Open Teacher Page
          </Button>

          {onViewRoster && (
            <Button
              size="sm"
              variant="info"
              icon={BookOpen}
              className="w-full sm:w-auto"
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
              variant="amber"
              icon={Edit2}
              className="w-full sm:w-auto"
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
