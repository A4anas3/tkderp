import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { BarChart3, TrendingUp, Layers, Award, Calendar } from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import DateRangeFilter from '../../components/common/DateRangeFilter';
import { reportApi } from '../../services/allApis';

export default function SubjectRevenuePage() {
  const [subjectData, setSubjectData] = useState(null);
  const [batchData, setBatchData] = useState([]);
  const [teacherData, setTeacherData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentFilters, setCurrentFilters] = useState({});

  const fetchReports = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const [subRes, bRes, tRes] = await Promise.all([
        reportApi.getSubjectRevenue(filters),
        reportApi.getBatchRevenue(filters),
        reportApi.getTeacherRevenue(filters),
      ]);
      setSubjectData(subRes);
      setBatchData(bRes || []);
      setTeacherData(tRes || []);
    } catch (err) {
      console.error('Failed to load revenue reports:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports({});
  }, [fetchReports]);

  const handleFilterChange = (newFilters) => {
    setCurrentFilters(newFilters);
    fetchReports(newFilters);
  };

  const summary = subjectData?.summary || {};
  const items = subjectData?.items || [];

  // Chart data formatting
  const chartData = items.map((itm) => ({
    name: itm.subject_name.length > 14 ? `${itm.subject_name.substring(0, 14)}...` : itm.subject_name,
    Booked: itm.total_booked,
    Collected: itm.total_collected,
    Outstanding: itm.balance_due,
  }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-slate-200 pb-3">
        <h1 className="text-xl sm:text-2xl font-bold text-black tracking-tight">
          Subject-Wise Revenue Distribution
        </h1>
        <p className="text-xs text-slate-500">
          Proportional revenue allocations across subjects, collections realized, and pending student dues
        </p>
      </div>

      {/* Choosable Date-to-Date & Month Filter */}
      <DateRangeFilter
        onFilterChange={handleFilterChange}
        title="Revenue Date Range & Month Filter"
      />

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500 animate-pulse bg-white border border-slate-200 rounded-lg">
          Loading revenue records for selected date range...
        </div>
      ) : (
        <>
          {/* Active Range Notice */}
          {currentFilters.from_date && currentFilters.to_date && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs flex items-center justify-between text-indigo-900">
              <span className="font-semibold">
                Showing revenue from <span className="font-bold underline">{currentFilters.from_date}</span> to <span className="font-bold underline">{currentFilters.to_date}</span>
              </span>
              <span className="text-[11px] bg-white px-2 py-0.5 rounded border border-indigo-200 font-bold">
                {items.length} Subjects Active
              </span>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              title="Total Billed Revenue"
              value={`₹${(summary.total_booked_all || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              subtext="Total booked admission value"
              icon={BarChart3}
              color="indigo"
            />
            <StatCard
              title="Total Actual Cash Collected"
              value={`₹${(summary.total_collected_all || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              subtext="Realized fees allocated to subjects"
              icon={TrendingUp}
              color="emerald"
            />
            <StatCard
              title="Total Outstanding Balance"
              value={`₹${(summary.total_balance_all || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              subtext="Pending student fees due"
              icon={Layers}
              color="rose"
            />
          </div>

          {/* Visual Chart */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-black">
                Booked vs Collected Revenue by Subject
              </h2>
              <span className="text-[11px] text-slate-500">Subject performance comparison</span>
            </div>

            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#000000' }} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} tickFormatter={(val) => `₹${val}`} />
                  <Tooltip
                    formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="Booked" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Billed / Booked" />
                  <Bar dataKey="Collected" fill="#059669" radius={[4, 4, 0, 0]} name="Collected Cash" />
                  <Bar dataKey="Outstanding" fill="#e11d48" radius={[4, 4, 0, 0]} name="Pending Balance" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Subject Revenue Table */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <h2 className="text-sm font-bold text-black pb-3 border-b border-slate-200 mb-3">
              Subject Revenue & Enrollment Ledger
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-2">Subject Name</th>
                    <th className="p-2">Code</th>
                    <th className="p-2 text-right">Standard Fee</th>
                    <th className="p-2 text-center">Enrollments</th>
                    <th className="p-2 text-right">Total Billed</th>
                    <th className="p-2 text-right text-emerald-800">Actual Collected</th>
                    <th className="p-2 text-right text-rose-700">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2 font-bold text-black flex items-center gap-1.5">
                        {s.subject_code === 'GREEN-CARD' ? (
                          <Award className="w-3.5 h-3.5 text-purple-600" />
                        ) : null}
                        {s.subject_name}
                      </td>
                      <td className="p-2 font-mono text-slate-600">{s.subject_code}</td>
                      <td className="p-2 text-right font-mono text-slate-700">
                        ₹{s.default_fee.toFixed(2)}
                      </td>
                      <td className="p-2 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-black">
                          {s.enrolled_count}
                        </span>
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-black">
                        ₹{s.total_booked.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-emerald-800">
                        ₹{s.total_collected.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-rose-700">
                        ₹{s.balance_due.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Batch Revenue Breakdown Table */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <h2 className="text-sm font-bold text-black pb-3 border-b border-slate-200 mb-3">
              Batch-Wise Collections & Realized Revenue
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-2">Batch Code</th>
                    <th className="p-2">Batch Name</th>
                    <th className="p-2">Faculty In-Charge</th>
                    <th className="p-2">Hall No</th>
                    <th className="p-2 text-center">Students</th>
                    <th className="p-2 text-right">Total Billed</th>
                    <th className="p-2 text-right text-emerald-800">Collected</th>
                    <th className="p-2 text-right text-rose-700">Due</th>
                    <th className="p-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batchData.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-500">
                        No batch revenue recorded in this period.
                      </td>
                    </tr>
                  ) : (
                    batchData.map((b, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 font-mono font-bold text-indigo-700">{b.batch_code}</td>
                        <td className="p-2 font-semibold text-black">{b.batch_name}</td>
                        <td className="p-2 text-slate-700">{b.teacher_name}</td>
                        <td className="p-2 text-slate-600 font-medium">{b.hall_number || 'Main'}</td>
                        <td className="p-2 text-center font-bold text-black">{b.enrolled_count}</td>
                        <td className="p-2 text-right font-mono font-bold text-black">
                          ₹{b.total_booked.toFixed(2)}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-800">
                          ₹{b.total_collected.toFixed(2)}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-rose-700">
                          ₹{b.balance_due.toFixed(2)}
                        </td>
                        <td className="p-2 text-center">
                          <Badge size="xs" variant={b.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {b.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Teacher-Wise Revenue Table */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <h2 className="text-sm font-bold text-black pb-3 border-b border-slate-200 mb-3">
              Teacher-Wise Associated Subject Revenue
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-2">Teacher Code</th>
                    <th className="p-2">Faculty Name</th>
                    <th className="p-2">Specialization</th>
                    <th className="p-2 text-center">Batches</th>
                    <th className="p-2 text-center">Students</th>
                    <th className="p-2 text-right">Total Billed</th>
                    <th className="p-2 text-right text-emerald-800">Collected</th>
                    <th className="p-2 text-right text-rose-700">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teacherData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-500">
                        No teacher revenue recorded in this period.
                      </td>
                    </tr>
                  ) : (
                    teacherData.map((t, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 font-mono font-bold text-indigo-700">{t.teacher_code}</td>
                        <td className="p-2 font-semibold text-black">{t.teacher_name}</td>
                        <td className="p-2 text-slate-700">{t.specialization}</td>
                        <td className="p-2 text-center font-bold text-black">{t.batches_count}</td>
                        <td className="p-2 text-center font-bold text-black">{t.enrolled_count}</td>
                        <td className="p-2 text-right font-mono font-bold text-black">
                          ₹{t.total_booked.toFixed(2)}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-800">
                          ₹{t.total_collected.toFixed(2)}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-rose-700">
                          ₹{t.balance_due.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
