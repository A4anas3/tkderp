import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, ArrowDownRight, ArrowUpRight, Wallet, Calendar } from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import { reportApi } from '../../services/allApis';

export default function CashFlowPage() {
  const [data, setData] = useState(null);
  const [year, setYear] = useState(2026);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCashMovement = async () => {
      setLoading(true);
      try {
        const res = await reportApi.getCashMovement(year);
        setData(res);
      } catch (err) {
        console.error('Failed to load cash flow:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCashMovement();
  }, [year]);

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-500 animate-pulse">Loading Cash Flow Ledger...</div>;
  }

  const breakdown = data?.monthly_breakdown || [];

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-black tracking-tight">
            Cash Movement & Operating Cash Flow
          </h1>
          <p className="text-xs text-slate-500">
            Realized cash inflows (fee collections) vs outflows (daily expenses & faculty salaries paid)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Financial Year:</span>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-black focus:outline-none focus:border-indigo-600"
          >
            <option value={2026}>2026 - 2027</option>
            <option value={2025}>2025 - 2026</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          title="Total Cash Inflows"
          value={`₹${(data?.total_inflows || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtext="Actual fee payments collected"
          icon={ArrowUpRight}
          color="emerald"
        />
        <StatCard
          title="Total Cash Outflows"
          value={`₹${(data?.total_outflows || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtext="Expenses + salaries disbursed"
          icon={ArrowDownRight}
          color="rose"
        />
        <StatCard
          title="Net Cash Position"
          value={`₹${(data?.net_cash_position || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtext="Net operating cash retained"
          icon={Wallet}
          color="indigo"
        />
      </div>

      {/* Chart */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-black">
            Monthly Inflows vs Outflows Trends ({year})
          </h2>
          <span className="text-[11px] text-slate-500">Cash velocity</span>
        </div>

        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={breakdown} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month_label" tick={{ fontSize: 11, fill: '#000000' }} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: '#475569' }} tickFormatter={(val) => `₹${val}`} />
              <Tooltip
                formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Bar dataKey="inflows" fill="#059669" radius={[4, 4, 0, 0]} name="Inflows (Collections)" />
              <Bar dataKey="total_outflows" fill="#e11d48" radius={[4, 4, 0, 0]} name="Outflows (Expenses+Salaries)" />
              <Bar dataKey="net_cash_flow" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Net Cash Margin" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Breakdown Table */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <h2 className="text-sm font-bold text-black pb-3 border-b border-slate-200 mb-3">
          Detailed Monthly Cash Flow Ledger
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-2">Month</th>
                <th className="p-2 text-right text-emerald-800">Inflows (Fee Collections)</th>
                <th className="p-2 text-right">Daily Expenses</th>
                <th className="p-2 text-right">Salaries Disbursed</th>
                <th className="p-2 text-right text-rose-700">Total Outflows</th>
                <th className="p-2 text-right font-bold text-black">Net Cash Flow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {breakdown.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-black">{row.month_label}</td>
                  <td className="p-2 text-right font-mono font-bold text-emerald-800">
                    +₹{row.inflows.toFixed(2)}
                  </td>
                  <td className="p-2 text-right font-mono text-slate-600">
                    -₹{row.daily_expenses.toFixed(2)}
                  </td>
                  <td className="p-2 text-right font-mono text-slate-600">
                    -₹{row.salaries_paid.toFixed(2)}
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-rose-700">
                    -₹{row.total_outflows.toFixed(2)}
                  </td>
                  <td className="p-2 text-right font-mono font-black text-black">
                    <span
                      className={
                        row.net_cash_flow >= 0
                          ? 'text-indigo-900 font-black'
                          : 'text-rose-700 font-black'
                      }
                    >
                      {row.net_cash_flow >= 0 ? '+' : ''}₹{row.net_cash_flow.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
