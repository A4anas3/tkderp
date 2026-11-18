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
      {/* Faculty Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-800 rounded-xl p-5 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-200 block mb-1">
            Faculty Teaching Portal
          </span>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">
            Welcome, {data?.teacher_name}
          </h1>
          <p className="text-xs text-indigo-100 mt-0.5">
            Specialization: {data?.specialization || 'Coaching Faculty'}
          </p>
        </div>

        <div className="flex gap-3">
          <div className="bg-white/10 backdrop-blur-xs border border-white/20 rounded-lg px-3 py-2 text-center">
            <span className="text-xs text-indigo-100 block">Assigned Batches</span>
            <span className="text-xl font-black">{data?.batches_count ?? 0}</span>
          </div>
          <div className="bg-white/10 backdrop-blur-xs border border-white/20 rounded-lg px-3 py-2 text-center">
            <span className="text-xs text-indigo-100 block">Enrolled Students</span>
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
            <div className="p-4 bg-white border border-slate-200 rounded-lg text-center text-xs text-slate-500">
              No batches assigned currently.
            </div>
          ) : (
            data.batches.map((b) => {
              const isSelected = b.batch_id === activeBatchId;
              return (
                <div
                  key={b.batch_id}
                  onClick={() => setActiveBatchId(b.batch_id)}
                  className={`p-3.5 rounded-lg border transition cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-400 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
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
                      <span>{b.schedule || 'Flexible Schedule'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-indigo-700 font-semibold pt-1">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      <span>{b.student_count} Enrolled Students</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Enrolled Students Roster for Selected Batch */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
            <div className="pb-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-black">
                  Student Roster — {activeBatch?.name || 'Select a batch'}
                </h2>
                <p className="text-xs text-slate-500">
                  {activeBatch ? `${activeBatch.student_count} students registered in this batch` : ''}
                </p>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              {!activeBatch || (activeBatch.students || []).length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No students enrolled in this batch yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">Registration ID</th>
                      <th className="p-2">Student Name</th>
                      <th className="p-2">Contact Phone</th>
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeBatch.students.map((st, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-2 font-mono font-semibold text-black">{st.registration_no}</td>
                        <td className="p-2 font-bold text-black">{st.student_name}</td>
                        <td className="p-2 text-slate-600 font-mono">
                          {st.mobile ? (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {st.mobile}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <Badge size="xs" variant="success">
                            Enrolled
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
