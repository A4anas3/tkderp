import React, { useState, useEffect } from 'react';
import { BookOpen, Users, Calendar, MapPin, Phone, GraduationCap } from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import { dashboardApi } from '../../services/allApis';

export default function TeacherDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeBatchId, setActiveBatchId] = useState(null);

  useEffect(() => {
    const fetchTeacherStats = async () => {
      try {
        const res = await dashboardApi.getTeacher();
        setData(res);
        if (res?.batches?.length > 0) {
          setActiveBatchId(res.batches[0].batch_id);
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
    return <div className="p-8 text-center text-xs text-slate-500 animate-pulse">Loading Faculty Portal...</div>;
  }

  const activeBatch = (data?.batches || []).find((b) => b.batch_id === activeBatchId);

  return (
    <div className="space-y-5">
      {/* Faculty Welcome Banner - Odoo Aubergine styling */}
      <div className="bg-gradient-to-r from-odoo-700 via-odoo-600 to-odoo-800 rounded-xl p-5 text-white shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-purple-200 block mb-1">
            Faculty Teaching Portal
          </span>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">
            Welcome, {data?.teacher_name}
          </h1>
          <p className="text-xs text-purple-100 mt-0.5">
            Specialization: {data?.specialization || 'Coaching Faculty'}
          </p>
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          <div className="flex-1 sm:flex-initial bg-white/10 backdrop-blur-xs border border-white/20 rounded-lg px-3 py-2 text-center">
            <span className="text-xs text-purple-100 block">Assigned Batches</span>
            <span className="text-xl font-black">{data?.batches_count ?? 0}</span>
          </div>
          <div className="flex-1 sm:flex-initial bg-white/10 backdrop-blur-xs border border-white/20 rounded-lg px-3 py-2 text-center">
            <span className="text-xs text-purple-100 block">Enrolled Students</span>
            <span className="text-xl font-black">{data?.total_unique_students ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Batches Grid & Student Roster */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Batches List */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-black">
            My Assigned Batches
          </h2>

          {(data?.batches || []).length === 0 ? (
            <div className="p-4 bg-white border border-slate-200 rounded-lg text-center text-xs text-slate-500 shadow-2xs">
              No batches assigned currently.
            </div>
          ) : (
            data.batches.map((b) => {
              const isSelected = b.batch_id === activeBatchId;
              return (
                <div
                  key={b.batch_id}
                  onClick={() => setActiveBatchId(b.batch_id)}
                  className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-50/70 border-odoo-500 shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-black">{b.name}</span>
                    <Badge size="xs" variant={b.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {b.status}
                    </Badge>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-slate-600">
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
                    <span className="text-slate-500">Students Enrolled:</span>
                    <span className="font-bold text-odoo-700 font-mono">
                      {b.students?.length ?? 0}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Enrolled Students in Selected Batch */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs flex flex-col h-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-sm font-bold text-black">
                  {activeBatch ? `Student Roster: ${activeBatch.name}` : 'Select a Batch'}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {activeBatch?.schedule || ''} {activeBatch?.hall_number ? `• Hall: ${activeBatch.hall_number}` : ''}
                </p>
              </div>

              {activeBatch && (
                <span className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md self-start sm:self-auto">
                  {activeBatch.students?.length ?? 0} Students Active
                </span>
              )}
            </div>

            <div className="mt-3 overflow-x-auto flex-1">
              {!activeBatch || (activeBatch.students || []).length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  No students currently enrolled in this batch.
                </p>
              ) : (
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead className="bg-slate-100/80 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Student Code</th>
                      <th className="p-2.5">Full Name</th>
                      <th className="p-2.5">Mobile Contact</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {activeBatch.students.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-2.5 font-mono font-bold text-odoo-700">
                          {st.student_code}
                        </td>
                        <td className="p-2.5 font-semibold text-black">{st.name}</td>
                        <td className="p-2.5 font-mono text-slate-700">
                          {st.mobile ? (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" /> {st.mobile}
                            </span>
                          ) : (
                            <span className="text-slate-400">None</span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          <Badge size="xs" variant={st.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {st.status}
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
