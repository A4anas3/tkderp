import React, { useState } from 'react';
import { Calendar, Filter, RotateCcw, Clock } from 'lucide-react';

export default function DateRangeFilter({ onFilterChange, title = 'Filter Date Range' }) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [activePreset, setActivePreset] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const applyPreset = (presetKey) => {
    setActivePreset(presetKey);
    const now = new Date();
    let f = '';
    let t = '';
    let m = '';
    let y = selectedYear;

    if (presetKey === 'today') {
      f = formatDate(now);
      t = formatDate(now);
    } else if (presetKey === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(now.setDate(diff));
      f = formatDate(monday);
      t = formatDate(new Date());
    } else if (presetKey === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      f = formatDate(firstDay);
      t = formatDate(new Date());
      m = now.getMonth() + 1;
      y = now.getFullYear();
    } else if (presetKey === 'last_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      f = formatDate(firstDay);
      t = formatDate(lastDay);
      m = firstDay.getMonth() + 1;
      y = firstDay.getFullYear();
    } else if (presetKey === 'this_year') {
      f = `${now.getFullYear()}-01-01`;
      t = `${now.getFullYear()}-12-31`;
      y = now.getFullYear();
    } else if (presetKey === 'all') {
      f = '';
      t = '';
      m = '';
      y = '';
    }

    setFromDate(f);
    setToDate(t);
    setSelectedMonth(m);
    setSelectedYear(y || currentYear);

    onFilterChange({
      from_date: f || null,
      to_date: t || null,
      month: m || null,
      year: y || null,
      preset: presetKey,
    });
  };

  const handleCustomApply = () => {
    setActivePreset('custom');
    onFilterChange({
      from_date: fromDate || null,
      to_date: toDate || null,
      month: selectedMonth ? parseInt(selectedMonth) : null,
      year: selectedYear ? parseInt(selectedYear) : null,
      preset: 'custom',
    });
  };

  const handleMonthYearChange = (m, y) => {
    setActivePreset('month_select');
    setSelectedMonth(m);
    setSelectedYear(y);

    if (m && y) {
      const lastDay = new Date(y, m, 0).getDate();
      const f = `${y}-${String(m).padStart(2, '0')}-01`;
      const t = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setFromDate(f);
      setToDate(t);

      onFilterChange({
        from_date: f,
        to_date: t,
        month: parseInt(m),
        year: parseInt(y),
        preset: 'month_select',
      });
    }
  };

  const handleReset = () => {
    applyPreset('all');
  };

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
        <div className="flex items-center gap-1.5 text-xs font-bold text-black uppercase tracking-wider">
          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
          <span>{title}</span>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-1">
          {[
            { id: 'all', label: 'All Time' },
            { id: 'today', label: 'Today' },
            { id: 'this_week', label: 'This Week' },
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'this_year', label: 'This Year' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`px-2 py-0.5 rounded text-xs font-semibold transition ${
                activePreset === p.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-black hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Choosable Start Date to End Date + Month Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 pt-1 items-end">
        <div>
          <label className="block text-[11px] font-bold text-black mb-1">
            Start Date (From)
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setActivePreset('custom');
            }}
            className="w-full rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-black bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-black mb-1">
            End Date (To)
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setActivePreset('custom');
            }}
            className="w-full rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-black bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-black mb-1">
            Select Month
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => handleMonthYearChange(e.target.value, selectedYear)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-medium text-black bg-white focus:outline-none focus:border-indigo-600"
          >
            <option value="">-- Choose Month --</option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-black mb-1">
            Year
          </label>
          <select
            value={selectedYear}
            onChange={(e) => handleMonthYearChange(selectedMonth, e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-medium text-black bg-white focus:outline-none focus:border-indigo-600"
          >
            {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCustomApply}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded text-xs transition shadow-sm"
          >
            Apply Range
          </button>
          <button
            onClick={handleReset}
            title="Reset Filters"
            className="p-1 rounded border border-slate-300 hover:bg-slate-100 text-black transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
