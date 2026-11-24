import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus,
  Phone,
  Award,
  ChevronRight,
  Eye,
  UserX,
  AlertTriangle,
  LayoutGrid,
  List,
  CreditCard,
  Plus,
  Calendar,
  Edit2,
} from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Avatar from '../../components/common/Avatar';
import QuickStudentModal from '../../components/modals/QuickStudentModal';
import EditStudentModal from '../../components/modals/EditStudentModal';
import { studentApi, remindersApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { WhatsAppIcon } from '../../utils/whatsappHelpers';

export default function StudentsPage() {
  const navigate = useNavigate();
  const { error } = useToast();
  const { isAdmin, isCashier, isTeacher, canManageAdmissions } = useAuth();
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('students_view_mode') || 'table';
    } catch (_) {
      return 'table';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('students_view_mode', viewMode);
    } catch (_) {}
  }, [viewMode]);

  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await studentApi.list({
        page,
        page_size: viewMode === 'kanban' ? 24 : 15,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
      });
      setStudents(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, viewMode]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const columns = [
    {
      header: 'Student',
      render: (s) => (
        <div className="flex items-center gap-2.5 min-w-[160px]">
          <Avatar src={s.photo_url} name={s.name} size="sm" status={s.status} />
          <div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/students/${s.id}`);
              }}
              className="font-bold text-black hover:text-odoo-600 transition text-left block"
            >
              {s.name}
            </button>
            {s.father_name && (
              <span className="text-[10px] text-slate-600 block">S/O {s.father_name}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Student Code / Purchase ID',
      className: 'w-44 whitespace-nowrap',
      render: (s) => (
        <div>
          <span className="font-mono font-bold text-odoo-700 block">{s.student_code}</span>
          {s.latest_admission_number && (
            <span className="font-mono text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 inline-block mt-0.5">
              Txn: {s.latest_admission_number}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Mobile Contact',
      className: 'w-36 whitespace-nowrap',
      render: (s) =>
        s.mobile ? (
          <a
            href={`tel:${s.mobile}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-900 hover:text-odoo-600"
          >
            <Phone className="w-3.5 h-3.5 text-odoo-600 shrink-0" />
            {s.mobile}
          </a>
        ) : (
          <span className="text-slate-500 text-xs italic">No mobile</span>
        ),
    },
    {
      header: 'Green Card Access',
      className: 'w-36 text-center whitespace-nowrap',
      render: (s) =>
        s.has_green_card ? (
          <Badge size="xs" variant="purple" className="gap-1">
            <Award className="w-3 h-3" /> All-Access Pass
          </Badge>
        ) : (
          <span className="text-slate-500 text-xs font-semibold">—</span>
        ),
    },
    {
      header: 'Reg Date',
      accessor: 'registration_date',
      className: 'font-mono text-xs w-28 whitespace-nowrap text-zinc-950',
    },
    {
      header: 'Status',
      className: 'text-center w-28 whitespace-nowrap',
      render: (s) => (
        <Badge
          size="xs"
          variant={
            s.status === 'REVOKED'
              ? 'danger'
              : s.status === 'ACTIVE'
              ? 'success'
              : 'neutral'
          }
        >
          {s.status}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right w-36 whitespace-nowrap',
      render: (s) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          {Number(s.total_balance_due || 0) > 0 && (
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const res = await remindersApi.sendStudentReminder(s.id);
                  if (res?.whatsapp_url) {
                    window.open(res.whatsapp_url, '_blank', 'noopener,noreferrer');
                  }
                } catch (err) {
                  console.error('Failed to send reminder:', err);
                }
              }}
              title={`Send WhatsApp due reminder (Due: ₹${Number(s.total_balance_due).toFixed(0)})`}
              className="h-7 px-2 rounded bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 font-bold inline-flex items-center gap-1 text-[11px] shadow-2xs cursor-pointer"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-700" />
              <span>Remind</span>
            </button>
          )}
          {canManageAdmissions && (
            <Button
              size="xs"
              variant="amber"
              icon={Edit2}
              onClick={(e) => {
                e.stopPropagation();
                setEditingStudent(s);
                setEditModalOpen(true);
              }}
              title="Edit Student Information"
            >
              Edit
            </Button>
          )}
          <Button
            size="xs"
            variant="info"
            icon={Eye}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/students/${s.id}`);
            }}
            title="View Student Profile"
          >
            Profile
          </Button>
        </div>
      ),
    },
  ];

  const totalPages = Math.max(1, Math.ceil(total / (viewMode === 'kanban' ? 24 : 15)));

  return (
    <div className="space-y-4">
      {/* Odoo Control Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {isTeacher ? 'Student Roster' : 'Registered Students'}
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            {isTeacher
              ? 'Enrolled student roster of your assigned subjects and courses.'
              : 'Student database with profile photos (≤ 20 KB), fee cycles, and Kanban view'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle - Odoo style */}
          <div className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setViewMode('table');
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition ${
                viewMode === 'table'
                  ? 'bg-white text-odoo-700 shadow-2xs'
                  : 'text-slate-700 hover:text-black'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('kanban');
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition ${
                viewMode === 'kanban'
                  ? 'bg-white text-odoo-700 shadow-2xs'
                  : 'text-slate-700 hover:text-black'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
          </div>

          {/* Status Filter Dropdown */}
          {!isTeacher && (
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-black focus:outline-none focus:border-odoo-600 min-h-[34px] w-full sm:w-auto shadow-2xs"
            >
              <option value="">All Students</option>
              <option value="ACTIVE">Active Students (Current Courses)</option>
              <option value="UPCOMING">Upcoming Students (Future Starts)</option>
              <option value="EXPIRED">Expired Students (Validity Lapsed)</option>
              <option value="DISCONTINUED">Discontinued Students</option>
              <option value="INACTIVE">Inactive / Revoked Students</option>
            </select>
          )}

          {canManageAdmissions && (
            <Button variant="primary" icon={UserPlus} onClick={() => setAddModalOpen(true)} className="w-full sm:w-auto font-bold">
              Register Student
            </Button>
          )}
        </div>
      </div>

      {/* Render Table or Kanban View */}
      {viewMode === 'table' ? (
        <DataTable
          columns={columns}
          data={students}
          total={total}
          page={page}
          pageSize={15}
          onPageChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          onRefresh={loadStudents}
          loading={loading}
          onRowClick={(s) => navigate(`/students/${s.id}`)}
          searchPlaceholder="Search by student name, mobile no, student code, or admission no..."
          emptyMessage="No students found."
        />
      ) : (
        /* Odoo Kanban Card Grid View */
        <div className="space-y-4">
          {/* Kanban Search & Summary Bar */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-3 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:max-w-md">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by student name, code, phone, or admission no..."
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs sm:text-sm text-black placeholder-slate-400 focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs bg-white"
              />
            </div>
            <div className="text-xs text-slate-600 font-medium self-start sm:self-auto">
              Showing <span className="font-bold text-black">{students.length}</span> of <span className="font-bold text-black">{total}</span> registered students
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-600 animate-pulse bg-white border border-slate-200 rounded-lg">
              Loading student cards...
            </div>
          ) : students.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-lg text-xs text-slate-600">
              No students found matching your criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {students.map((s) => {
                const isRev = s.status === 'REVOKED';
                return (
                  <div
                    key={s.id}
                    className={`bg-white border rounded-lg p-3.5 shadow-2xs transition-all hover:shadow-md flex flex-col justify-between ${
                      isRev ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200 hover:border-odoo-300'
                    }`}
                  >
                    {/* Top Row: Avatar + Name + Code */}
                    <div>
                      <div className="flex items-start gap-2.5">
                        <Avatar
                          src={s.photo_url}
                          name={s.name}
                          size="md"
                          status={s.status}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => navigate(`/students/${s.id}`)}
                            className="font-bold text-black text-sm hover:text-odoo-700 truncate block text-left w-full transition-colors"
                            title={s.name}
                          >
                            {s.name}
                          </button>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[10px] font-bold text-odoo-800 bg-purple-50 border border-odoo-200 px-1.5 py-0.5 rounded-full">
                              {s.student_code}
                            </span>
                            <Badge
                              size="xs"
                              variant={isRev ? 'danger' : s.status === 'ACTIVE' ? 'success' : 'neutral'}
                            >
                              {s.status}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Bio Details */}
                      <div className="mt-3 space-y-1.5 text-xs border-t border-slate-100 pt-2.5">
                        {s.father_name && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-700 font-semibold">Father:</span>
                            <span className="font-medium text-black truncate max-w-[140px]">{s.father_name}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-700 font-semibold">Mobile:</span>
                          {s.mobile ? (
                            <a
                              href={`tel:${s.mobile}`}
                              className="font-mono font-bold text-black hover:text-odoo-600 flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3 text-odoo-600" />
                              {s.mobile}
                            </a>
                          ) : (
                            <span className="text-slate-500 italic">None</span>
                          )}
                        </div>

                        {s.latest_admission_number && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-700 font-semibold">Purchase ID:</span>
                            <span className="font-mono font-bold text-odoo-900 bg-purple-50 px-1.5 py-0.5 rounded border border-odoo-200">
                              {s.latest_admission_number}
                            </span>
                          </div>
                        )}

                        {/* Optional Fee if present */}
                        {(s.fee !== undefined || s.default_fee !== undefined) && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-700 font-semibold">Fee:</span>
                            <span className="font-mono font-bold text-emerald-800">
                              ₹{Number(s.fee ?? s.default_fee).toFixed(0)}
                            </span>
                          </div>
                        )}

                        {/* Optional Teacher if present */}
                        {(s.teacher || s.teacher_name) && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-700 font-semibold">Teacher:</span>
                            <span className="font-bold text-black truncate max-w-[140px]">
                              {s.teacher || s.teacher_name}
                            </span>
                          </div>
                        )}

                        {s.has_green_card && (
                          <div className="pt-1">
                            <Badge size="xs" variant="purple" className="w-full justify-center gap-1">
                              <Award className="w-3 h-3" /> All-Access Pass
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Card Actions */}
                    <div className="mt-3.5 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                      {canManageAdmissions && (
                        <Button
                          size="xs"
                          variant="amber"
                          icon={Edit2}
                          onClick={() => {
                            setEditingStudent(s);
                            setEditModalOpen(true);
                          }}
                          title="Edit Student Information"
                        >
                          Edit
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="info"
                        className="flex-1 justify-center"
                        icon={Eye}
                        onClick={() => navigate(`/students/${s.id}`)}
                      >
                        Profile
                      </Button>
                      {canManageAdmissions && !isRev && (
                        <Button
                          size="xs"
                          variant="primary"
                          className="flex-1 justify-center"
                          icon={Plus}
                          onClick={() =>
                            navigate(
                              `/enrollments/new?student_id=${s.id}&name=${encodeURIComponent(s.name)}`
                            )
                          }
                          title="Purchase / Renew Subject Fee"
                        >
                          + Enrol
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Kanban Pagination */}
          {totalPages > 1 && (
            <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex items-center justify-between text-xs">
              <span className="text-slate-700">
                Page <span className="font-bold text-black">{page}</span> of <span className="font-bold text-black">{totalPages}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-[30px]"
                >
                  Previous
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-[30px]"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Register Student Modal */}
      <QuickStudentModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onStudentCreated={(newSt) => {
          loadStudents();
          if (newSt?.id) {
            navigate(`/students/${newSt.id}`);
          }
        }}
      />

      {/* Edit Student Modal */}
      {editingStudent && (
        <EditStudentModal
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setEditingStudent(null);
          }}
          student={editingStudent}
          onStudentUpdated={() => {
            loadStudents();
          }}
        />
      )}
    </div>
  );
}
