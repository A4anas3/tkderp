import React from 'react';

export default function StatCard({
  title,
  value,
  subtext,
  icon: Icon,
  color = 'indigo',
  onClick,
}) {
  const colorMap = {
    indigo: {
      bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      border: 'border-l-indigo-600',
    },
    emerald: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      border: 'border-l-emerald-600',
    },
    amber: {
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      border: 'border-l-amber-500',
    },
    rose: {
      bg: 'bg-rose-50 text-rose-700 border-rose-200',
      border: 'border-l-rose-600',
    },
    blue: {
      bg: 'bg-blue-50 text-blue-700 border-blue-200',
      border: 'border-l-blue-600',
    },
    purple: {
      bg: 'bg-purple-50 text-purple-700 border-purple-200',
      border: 'border-l-purple-600',
    },
  };

  const scheme = colorMap[color] || colorMap.indigo;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border border-slate-200 border-l-4 ${
        scheme.border
      } p-3 sm:p-4 shadow-sm hover:shadow transition-shadow ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">
            {title}
          </p>
          <div className="text-lg sm:text-2xl font-bold text-black mt-1 tracking-tight">
            {value}
          </div>
          {subtext && <p className="text-[11px] text-slate-600 mt-1 font-medium">{subtext}</p>}
        </div>
        {Icon && (
          <div className={`p-2 sm:p-2.5 rounded-lg border shrink-0 ${scheme.bg}`}>
            <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        )}
      </div>
    </div>
  );
}
