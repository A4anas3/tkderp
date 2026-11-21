import React from 'react';

export default function Badge({
  children,
  variant = 'neutral',
  size = 'sm',
  dot = false,
  className = '',
}) {
  const variants = {
    neutral: 'bg-slate-100 text-slate-800 border-slate-300',
    primary: 'bg-purple-50 text-odoo-700 border-odoo-200 font-semibold',
    odoo: 'bg-purple-50 text-odoo-700 border-odoo-200 font-semibold',
    teal: 'bg-teal-50 text-teal-800 border-teal-300 font-semibold',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold',
    warning: 'bg-amber-50 text-amber-950 border-amber-300 font-semibold',
    danger: 'bg-rose-50 text-rose-800 border-rose-300 font-semibold',
    info: 'bg-sky-50 text-sky-800 border-sky-300 font-semibold',
    purple: 'bg-purple-50 text-purple-900 border-purple-300 font-semibold',
  };

  const dotColors = {
    neutral: 'bg-slate-400',
    primary: 'bg-odoo-600',
    odoo: 'bg-odoo-600',
    teal: 'bg-teal-600',
    success: 'bg-emerald-600',
    warning: 'bg-amber-500',
    danger: 'bg-rose-600',
    info: 'bg-sky-500',
    purple: 'bg-purple-600',
  };

  const sizes = {
    xs: 'text-[11px] px-2 py-0.5',
    sm: 'text-xs px-2.5 py-0.5',
    md: 'text-sm px-3 py-1',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border shadow-2xs font-semibold leading-tight select-none ${
        variants[variant] || variants.neutral
      } ${sizes[size] || sizes.sm} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant] || 'bg-slate-400'}`}
        />
      )}
      {children}
    </span>
  );
}
