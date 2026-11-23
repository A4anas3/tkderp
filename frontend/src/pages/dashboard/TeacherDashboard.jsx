import React, { useState, useEffect } from 'react';
import { BookOpen, Users, Calendar, MapPin, Phone, GraduationCap, CheckCircle } from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import { dashboardApi } from '../../services/allApis';

export default function TeacherDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSubjectId, setActiveSubjectId] = useState(null);

  useEffect(() => {
    const fetchTeacherStats = async () => {
      try {
        const res = await dashboardApi.getTeacher();
        setData(res);
        const list = res?.subjects || res?.batches || [];
        if (list.length > 0) {
          setActiveSubjectId(list[0].batch_id || list[0].id);
        }
      } catch (err) {
        console.error('Failed to load teacher dashboard:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTeacherStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-28 bg-slate-200 rounded-xl"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="h-64 bg-slate-200 rounded-xl"></div>
          <div className="lg:col-span-2 h-64 bg-slate-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  const subjectsList = data?.subjects || data?.batches || [];
  const activeSubject = subjectsList.find((b) => (b.batch_id || b.id) === activeSubjectId);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Faculty Welcome Banner - Odoo Aubergine styling */}
      <div className="bg-gradient-to-r from-[#4b3044] via-[#714b67] to-[#5e3c55] border border-purple-900/40 rounded-xl p-4 sm:p-6 text-white shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-purple-200 bg-white/10 px-2.5 py-0.5 rounded-full inline-block mb-1.5 border border-white/10">
            Faculty Teaching Portal
          </span>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Welcome, {data?.teacher_name}
          </h1>
          <p className="text-xs text-purple-100/90 mt-0.5 font-medium">
            Specialization: {data?.specialization || 'Coaching Faculty'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:flex sm:gap-3 w-full sm:w-auto">
          <div className="flex-1 sm:flex-initial bg-white/15 backdrop-blur-xs border border-white/20 rounded-xl px-4 py-2.5 text-center">
            <span className="text-[11px] sm:text-xs text-purple-100 block font-medium">Assigned Subjects</span>
            <span className="text-xl sm:text-2xl font-black text-white mt-0.5">{data?.subjects_count ?? data?.batches_count ?? 0}</span>
          </div>
          <div className="flex-1 sm:flex-initial bg-white/15 backdrop-blur-xs border border-white/20 rounded-xl px-4 py-2.5 text-center">
            <span className="text-[11px] sm:text-xs text-purple-100 block font-medium">Enrolled Students</span>
            <span className="text-xl sm:text-2xl font-black text-white mt-0.5">{data?.total_unique_students ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Subjects Grid & Student Roster */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Subjects List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-purple-50 text-odoo-600 border border-purple-200">
                <BookOpen className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-black">
                My Assigned Subjects
              </h2>
            </div>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {subjectsList.length}
            </span>
          </div>

          {subjectsList.length === 0 ? (
            <div className="p-6 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-500 font-medium shadow-2xs">
              No subjects assigned currently.
            </div>
          ) : (
            subjectsList.map((b) => {
              const itemId = b.batch_id || b.id;
              const isSelected = itemId === activeSubjectId;
              const studentCount = b.students?.length ?? b.student_count ?? 0;
              return (
                <div
                  key={itemId}
                  onClick={() => setActiveSubjectId(itemId)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-50/80 border-odoo-500 ring-2 ring-odoo-500/20 shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm sm:text-base text-black truncate">{b.name}</span>
                    <Badge size="xs" variant={b.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {b.status}
                    </Badge>
                  </div>

                  <div className="mt-2.5 space-y-1 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{b.hall_number || 'Room TBD'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{b.schedule || 'Flexible'}</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Students Enrolled:</span>
                    <span className="font-bold text-odoo-700 font-mono text-sm">
                      {studentCount}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Enrolled Students in Selected Subject */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col h-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-black">
                  {activeSubject ? `Student Roster: ${activeSubject.name}` : 'Select a Subject'}
                </h2>
                <p className="text-[11px] text-slate-700 font-medium mt-0.5">
                  {activeSubject?.schedule || ''} {activeSubject?.hall_number ? `• Hall: ${activeSubject.hall_number}` : ''}
                </p>
              </div>

              {activeSubject && (
                <span className="text-xs font-bold text-odoo-800 bg-purple-50 border border-purple-200 px-3 py-1 rounded-full self-start sm:self-auto shadow-2xs">
                  {activeSubject.students?.length ?? activeSubject.student_count ?? 0} Students Active
                </span>
              )}
            </div>

            <div className="mt-3.5 overflow-x-auto -webkit-overflow-scrolling-touch flex-1 rounded-lg border border-slate-200">
              {!activeSubject || (activeSubject.students || []).length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-700 font-semibold bg-white">
                  No students currently enrolled in this subject.
                </p>
              ) : (
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead className="bg-slate-100 text-slate-900 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="p-3">Student Code</th>
                      <th className="p-3">Full Name</th>
                      <th className="p-3">Mobile Contact</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {activeSubject.students.map((st, idx) => (
                      <tr key={st.student_id || st.id || idx} className="hover:bg-purple-50/20 transition-colors">
                        <td className="p-3 font-mono font-bold text-odoo-700">
                          {st.student_code || st.registration_no || '—'}
                        </td>
                        <td className="p-3 font-semibold text-black">
                          {st.name || st.student_name || '—'}
                        </td>
                        <td className="p-3 font-mono text-slate-800 font-medium">
                          {st.mobile ? (
                            <span className="flex items-center gap-1.5">
                              <Phone className="w-3 h-3 text-slate-600" /> {st.mobile}
                            </span>
                          ) : (
                            <span className="text-slate-600 font-sans">None</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Badge size="xs" variant={st.status === 'INACTIVE' ? 'neutral' : 'success'}>
                            {st.status || 'ACTIVE'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
