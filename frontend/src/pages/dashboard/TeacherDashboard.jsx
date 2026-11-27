import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Calendar, MapPin } from 'lucide-react';
import Badge from '../../components/common/Badge';
import PaginationBar from '../../components/common/PaginationBar';
import { dashboardApi } from '../../services/allApis';

const PAGE_SIZE = 50;

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeacherStats = async () => {
      setLoading(true);
      try {
        const res = await dashboardApi.getTeacher({ page, page_size: PAGE_SIZE });
        setData(res);
      } catch (err) {
        console.error('Failed to load teacher dashboard:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTeacherStats();
  }, [page]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-28 bg-slate-200 rounded-xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="h-40 bg-slate-200 rounded-xl"></div>
          <div className="h-40 bg-slate-200 rounded-xl"></div>
          <div className="h-40 bg-slate-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  const subjectsList = data?.subjects || [];

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

        <div className="flex gap-3 w-full sm:w-auto">
          <div className="flex-1 sm:flex-initial bg-white/15 backdrop-blur-xs border border-white/20 rounded-xl px-4 py-2.5 text-center">
            <span className="text-[11px] sm:text-xs text-purple-100 block font-medium">Assigned Subjects</span>
            <span className="text-xl sm:text-2xl font-black text-white mt-0.5">{data?.subjects_count ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Assigned Subjects Grid */}
      <div className="space-y-3">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjectsList.map((b) => {
              const itemId = b.id || b.batch_id;
              return (
                <div
                  key={itemId}
                  onClick={() => navigate(`/subjects/${itemId}`)}
                  className="p-4 rounded-xl border bg-white border-slate-200 hover:border-odoo-400 shadow-2xs hover:bg-purple-50/30 transition-all cursor-pointer"
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
                </div>
              );
            })}
          </div>
        )}

        <PaginationBar
          page={page}
          pageSize={data?.subjects_page_size || PAGE_SIZE}
          total={data?.subjects_total ?? (data?.subjects_count ?? subjectsList.length)}
          totalPages={data?.subjects_total_pages || 1}
          onPageChange={(p) => setPage(p)}
          loading={loading}
          itemLabel="subjects"
          className="rounded-xl border border-slate-200"
        />
      </div>
    </div>
  );
}
