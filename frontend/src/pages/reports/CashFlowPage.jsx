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
import { ArrowDownRight, ArrowUpRight, Wallet, RotateCcw } from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import DateRangeFilter from '../../components/common/DateRangeFilter';
import { reportApi } from '../../services/allApis';

export default function CashFlowPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentFilters, setCurrentFilters] = useState({});

  const fetchCashMovement = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const res = await reportApi.getCashMovement(filters);
      setData(res);
    } catch (err) {
      console.error('Failed to load cash flow:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCashMovement({});
  }, [fetchCashMovement]);

  const handleFilterChange = (newFilters) => {
    setCurrentFilters(newFilters);
    fetchCashMovement(newFilters);
  };

  const breakdown = data?.breakdown || data?.monthly_breakdown || [];

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="border-b border-slate-200 pb-3">
        <h1 className="text-xl sm:text-2xl font-bold text-black tracking-tight">
          Cash Movement & Operating Cash Flow
        </h1>
        <p className="text-xs text-slate-500">
          Realized cash inflows (fee collections) vs outflows (daily expenses, faculty salaries & student fee refunds)
        </p>
      </div>

      {/* Date Range & Month Filter */}
      <DateRangeFilter
        onFilterChange={handleFilterChange}
        title="Cash Flow Date Range & Month Selector"
      />

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500 animate-pulse bg-white border border-slate-200 rounded-lg">
          Loading Cash Movement Ledger...
        </div>
      ) : (
        <>
          {/* Active Filter Notice */}
          {currentFilters.from_date && currentFilters.to_date && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs flex items-center justify-between text-indigo-900">
              <span className="font-semibold">
                Cash Flow Window: <span className="font-bold underline">{currentFilters.from_date}</span> to <span className="font-bold underline">{currentFilters.to_date}</span>
              </span>
              <span className="text-[11px] bg-white px-2 py-0.5 rounded border border-indigo-200 font-bold">
                {breakdown.length} Interval Periods
              </span>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <StatCard
              title="Total Cash Inflows"
              value={`₹${(data?.total_inflows || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              subtext="Actual fee payments collected"
              icon={ArrowUpRight}
              color="emerald"
            />
            <StatCard
              title="Total Operating Expenses"
              value={`₹${((data?.total_expenses || 0) + (data?.total_salaries || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              subtext="Daily expenses + salaries disbursed"
              icon={ArrowDownRight}
              color="rose"
            />
            <StatCard
              title="Fee Refunds Disbursed"
              value={`₹${(data?.total_refunds || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              subtext="Returned student fees"
              icon={RotateCcw}
              color="amber"
            />
            <StatCard
              title="Net Cash Position"
              value={`₹${(data?.net_cash_position || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              subtext="Inflows minus total outflows"
              icon={Wallet}
              color="indigo"
            />
          </div>

          {/* Visual Chart */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-black">
                Inflows vs Total Outflows Trends
              </h2>
              <span className="text-[11px] text-slate-500">Cash velocity & retention</span>
            </div>

            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={breakdown} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="period_label" tick={{ fontSize: 11, fill: '#000000' }} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} tickFormatter={(val) => `₹${val}`} />
                  <Tooltip
                    formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="inflows" fill="#059669" radius={[4, 4, 0, 0]} name="Inflows (Collections)" />
                  <Bar dataKey="total_outflows" fill="#e11d48" radius={[4, 4, 0, 0]} name="Total Outflows" />
                  <Bar dataKey="fee_refunds" fill="#d97706" radius={[4, 4, 0, 0]} name="Fee Refunds" />
                  <Bar dataKey="net_cash_flow" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Net Margin" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Ledger Table */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <h2 className="text-sm font-bold text-black pb-3 border-b border-slate-200 mb-3">
              Detailed Cash Flow & Movement Ledger
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-2">Period</th>
                    <th className="p-2 text-right text-emerald-800">Inflows (Fees)</th>
                    <th className="p-2 text-right">Daily Expenses</th>
                    <th className="p-2 text-right">Salaries Paid</th>
                    <th className="p-2 text-right text-amber-700">Fee Refunds</th>
                    <th className="p-2 text-right text-rose-700">Total Outflows</th>
                    <th className="p-2 text-right font-bold text-black">Net Cash Flow</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {breakdown.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2 font-bold text-black">{row.period_label || row.month_label}</td>
                      <td className="p-2 text-right font-mono font-bold text-emerald-800">
                        +₹{row.inflows.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono text-slate-600">
                        -₹{row.daily_expenses.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono text-slate-600">
                        -₹{row.salaries_paid.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-amber-700">
                        {row.fee_refunds > 0 ? `-₹${row.fee_refunds.toFixed(2)}` : '₹0.00'}
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
        </>
      )}
    </div>
  );
}
