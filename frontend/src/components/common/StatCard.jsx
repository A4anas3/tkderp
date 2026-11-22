import React from 'react';

export default function StatCard({
  title,
  value,
  subtext,
  icon: Icon,
  color = 'odoo',
  onClick,
}) {
  const colorMap = {
    odoo: {
      bg: 'bg-purple-50 text-odoo-700 border-odoo-200',
      border: 'border-l-odoo-600',
      iconText: 'text-odoo-600',
    },
    indigo: {
      bg: 'bg-purple-50 text-odoo-700 border-odoo-200',
      border: 'border-l-odoo-600',
      iconText: 'text-odoo-600',
    },
    emerald: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      border: 'border-l-emerald-600',
      iconText: 'text-emerald-600',
    },
    amber: {
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      border: 'border-l-amber-500',
      iconText: 'text-amber-600',
    },
    rose: {
      bg: 'bg-rose-50 text-rose-700 border-rose-200',
      border: 'border-l-rose-600',
      iconText: 'text-rose-600',
    },
    blue: {
      bg: 'bg-sky-50 text-sky-700 border-sky-200',
      border: 'border-l-sky-600',
      iconText: 'text-sky-600',
    },
    teal: {
      bg: 'bg-teal-50 text-teal-700 border-teal-200',
      border: 'border-l-teal-600',
      iconText: 'text-teal-600',
    },
    purple: {
      bg: 'bg-purple-50 text-purple-700 border-purple-200',
      border: 'border-l-purple-600',
      iconText: 'text-purple-600',
    },
  };

  const scheme = colorMap[color] || colorMap.odoo;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 border-l-4 ${
        scheme.border
      } p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-all ${
        onClick ? 'cursor-pointer active:scale-[0.99] active:bg-slate-50' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-800 leading-tight truncate">
            {title}
          </p>
          <div className="text-xl sm:text-2xl lg:text-[22px] xl:text-2xl font-black text-black mt-1 tracking-tight truncate font-sans">
            {value}
          </div>
          {subtext && (
            <p className="text-[10px] sm:text-[11px] text-slate-700 mt-1 font-semibold leading-tight truncate">
              {subtext}
            </p>
          )}
        </div>
        {Icon && (
          <div className={`p-2.5 sm:p-3 rounded-xl border shrink-0 ${scheme.bg} flex items-center justify-center shadow-2xs`}>
            <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${scheme.iconText}`} />
          </div>
        )}
      </div>
    </div>
  );
}
