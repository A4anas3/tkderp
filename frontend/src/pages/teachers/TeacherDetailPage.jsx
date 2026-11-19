import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
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
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CreditCard
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import { teacherApi, reportApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { formatIndianDate, formatCycleLabel } from '../../utils/dateCycleUtils';

const PAGE_SIZE = 10;

export default function TeacherDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [teacher, setTeacher] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Pagination for Roster
  const [rosterSearch, setRosterSearch] = useState('');
  const [page, setPage] = useState(1);

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    qualification: '',
    specialization: '',
    joining_date: '',
    status: 'ACTIVE',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load teacher profile
      const tData = await teacherApi.get(id);
      setTeacher(tData);
      setFormData({
        name: tData.name || '',
        mobile: tData.mobile || '',
        email: tData.email || '',
        qualification: tData.qualification || '',
        specialization: tData.specialization || '',
        joining_date: tData.joining_date || '',
        status: tData.status || 'ACTIVE',
      });

      // 2. Load teacher student roster from reportApi
      try {
        const revData = await reportApi.getTeacherRevenue({});
        const teacherRev = (revData || []).find(
          (item) => String(item.teacher_id) === String(id) || item.teacher_name === tData.name
        );
        if (teacherRev && teacherRev.students) {
          setStudents(teacherRev.students);
        } else {
          setStudents([]);
        }
      } catch (err) {
        console.warn('Could not load teacher roster revenue', err);
      }
    } catch (err) {
      error(err.message || 'Failed to load teacher details');
    } finally {
      setLoading(false);
    }
  }, [id, error]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await teacherApi.update(id, formData);
      success('Faculty profile updated successfully');
      setEditModalOpen(false);
      loadData();
    } catch (err) {
      error(err.message || 'Failed to update faculty details');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered & Paginated Students
  const filteredStudents = useMemo(() => {
    if (!students) return [];
    if (!rosterSearch.trim()) return students;
    const q = rosterSearch.toLowerCase().trim();
    return students.filter(
      (s) =>
        s.student_name?.toLowerCase().includes(q) ||
        s.student_code?.toLowerCase().includes(q) ||
        s.mobile?.includes(q) ||
        s.batch_name?.toLowerCase().includes(q) ||
        s.subject_name?.toLowerCase().includes(q)
    );
  }, [students, rosterSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedStudents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, currentPage]);

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
          <ArrowLeft className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Loading faculty profile & roster...</span>
        </div>
        <div className="bg-white rounded-xl p-8 border border-slate-200 animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/3"></div>
          <div className="h-12 bg-slate-100 rounded"></div>
          <div className="h-32 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/teachers')}>
          Back to Faculty & Teachers
        </Button>
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
          <p className="text-sm font-semibold text-rose-700">Faculty record not found.</p>
        </div>
      </div>
    );
  }

  const isActive = teacher.status === 'ACTIVE';

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/teachers')}
            className="p-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer"
            title="Back to Faculty & Teachers"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-black">
                {teacher.name}
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold border border-slate-200">
                {teacher.teacher_code}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {teacher.specialization || 'Faculty Member'} • Joined on {formatIndianDate(teacher.joining_date)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={Edit2}
            onClick={() => setEditModalOpen(true)}
            size="sm"
          >
            Edit Faculty Profile
          </Button>
        </div>
      </div>

      {/* Prominent Active vs Inactive Status Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
          isActive
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : 'bg-slate-100 border-slate-300 text-slate-800'
        }`}
      >
        <div className="flex items-center gap-3">
          {isActive ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          ) : (
            <XCircle className="w-6 h-6 text-slate-500 shrink-0" />
          )}
          <div>
            <div className="text-xs font-black uppercase tracking-wider">
              Faculty Status: {isActive ? 'ACTIVE FACULTY MEMBER' : 'INACTIVE / ON LEAVE'}
            </div>
            <div className="text-xs text-slate-700 font-medium mt-0.5">
              {isActive
                ? 'Faculty is currently assigned to coaching cohorts and active batch schedules'
                : 'Faculty member is currently inactive or on leave'}
            </div>
          </div>
        </div>
        <Badge
          variant={isActive ? 'success' : 'neutral'}
          size="md"
          className="uppercase font-bold tracking-wider self-start sm:self-auto"
        >
          {teacher.status}
        </Badge>
      </div>

      {/* Faculty Bio Grid */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center gap-3.5 border-b border-slate-100 pb-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-base border border-indigo-200 shrink-0">
            {teacher.name ? teacher.name.slice(0, 2).toUpperCase() : 'TC'}
          </div>
          <div>
            <h2 className="font-bold text-black text-lg">
              {teacher.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-0.5">
              <span className="font-semibold text-indigo-700">{teacher.qualification || 'Educator'}</span>
              <span>•</span>
              <span className="font-mono">{teacher.teacher_code}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 block font-medium">Contact Mobile</span>
            <span className="font-mono font-bold text-black text-sm">
              {teacher.mobile || '—'}
            </span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 block font-medium">Email Address</span>
            <span className="font-medium text-black text-sm truncate block">
              {teacher.email || '—'}
            </span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 block font-medium">Enrolled Cohort Size</span>
            <span className="font-bold text-indigo-900 text-sm flex items-center gap-1">
              <Users className="w-4 h-4 text-indigo-600" />
              <span>{students.length} Enrolled Student(s)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Complete Enrolled Students Roster with Rolling Date-to-Date Fee Cycles */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3 p-4 sm:p-5">
        {/* Header with Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="font-bold text-black text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              <span>Assigned Enrolled Students Roster ({filteredStudents.length})</span>
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Individual rolling date-to-date monthly fee cycles • Click any row to view student profile
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search student, code, mobile..."
              value={rosterSearch}
              onChange={(e) => {
                setRosterSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-black placeholder:text-slate-400 font-medium shadow-2xs"
            />
          </div>
        </div>

        {/* Roster Table */}
        {filteredStudents.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
            No enrolled students found for this faculty member.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Student</th>
                  <th className="p-3">Subject & Batch</th>
                  <th className="p-3">Hall Room</th>
                  <th className="p-3">Rolling Billing Cycle</th>
                  <th className="p-3 text-center">Cycle Status</th>
                  <th className="p-3 text-right">Fee Billed</th>
                  <th className="p-3 text-right text-emerald-800">Collected</th>
                  <th className="p-3 text-right text-rose-700">Due</th>
                  <th className="p-3 text-center">Payment</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedStudents.map((s, idx) => (
                  <tr
                    key={idx}
                    onClick={() => navigate(`/students/${s.student_id}`)}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                    title="Click to view full student profile & ledger"
                  >
                    {/* Student Info */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {s.photo_url ? (
                          <img
                            src={s.photo_url}
                            alt={s.student_name}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs shrink-0 border border-indigo-200">
                            {s.student_name ? s.student_name.slice(0, 2).toUpperCase() : 'ST'}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-black hover:text-indigo-600 transition">
                            {s.student_name}
                          </div>
                          <div className="font-mono text-[11px] text-slate-600 font-semibold">
                            {s.student_code}
                          </div>
                          {s.mobile && (
                            <div className="text-[11px] text-slate-600 font-mono">
                              📞 {s.mobile}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Subject & Batch */}
                    <td className="p-3 text-slate-700">
                      <div className="font-semibold text-black">{s.subject_name || 'Subject'}</div>
                      <div className="text-[11px] text-slate-500">{s.batch_name}</div>
                    </td>

                    {/* Hall Room */}
                    <td className="p-3 text-slate-700 font-medium">
                      {s.hall_number ? `Hall: ${s.hall_number}` : 'Main Campus'}
                    </td>

                    {/* Rolling Billing Cycle */}
                    <td className="p-3">
                      <div className="font-mono font-bold text-black text-xs">
                        {s.cycle_label || formatCycleLabel(s.valid_from, s.valid_to)}
                      </div>
                      <div className="text-[11px] text-indigo-700 font-semibold">
                        {s.billing_cycle_anchor || `Day ${s.billing_day || 1} cycle`}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        Next Due: {s.next_due_date || '—'}
                      </div>
                    </td>

                    {/* Cycle Status */}
                    <td className="p-3 text-center">
                      <Badge variant={s.badge_variant || 'neutral'} size="xs">
                        {s.status_label || s.cycle_status}
                      </Badge>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                        {s.status_subtext}
                      </div>
                    </td>

                    {/* Fee Billed */}
                    <td className="p-3 text-right font-mono font-bold text-black">
                      ₹{(s.net_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Amount Collected */}
                    <td className="p-3 text-right font-mono font-bold text-emerald-800">
                      ₹{(s.amount_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Balance Due */}
                    <td className="p-3 text-right font-mono font-bold text-rose-700">
                      ₹{(s.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Payment Status */}
                    <td className="p-3 text-center">
                      <Badge
                        size="xs"
                        variant={
                          s.payment_status === 'PAID'
                            ? 'success'
                            : s.payment_status === 'PARTIAL'
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {s.payment_status}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Link
                        to={`/students/${s.student_id}`}
                        className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-black font-semibold rounded border border-slate-300 inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-600" />
                        <span>Profile</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">
              Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
              {Math.min(currentPage * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length} students
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
                className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronsLeft className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <span className="px-2 font-bold text-slate-800">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronsRight className="w-3.5 h-3.5 text-slate-600" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Faculty Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Faculty Profile"
        subtitle={`Teacher Code: ${teacher.teacher_code}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleUpdate} className="space-y-3 text-xs">
          <Input
            label="Faculty Name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          <Input
            label="Mobile Number"
            required
            value={formData.mobile}
            onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
          />

          <Input
            label="Email Address"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Qualification"
              value={formData.qualification}
              onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
            />
            <Input
              label="Specialization"
              value={formData.specialization}
              onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Joining Date"
              type="date"
              value={formData.joining_date}
              onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
            />
            <Select
              label="Faculty Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={[
                { value: 'ACTIVE', label: 'Active Faculty' },
                { value: 'INACTIVE', label: 'Inactive / On Leave' },
              ]}
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setEditModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
