import React from 'react';

export default function Badge({
  children,
  variant = 'neutral',
  size = 'sm',
  dot = false,
  className = '',
}) {
  const variants = {
    neutral: 'bg-slate-100 text-slate-900 border-slate-300 font-bold',
    default: 'bg-slate-100 text-slate-900 border-slate-300 font-bold',
    primary: 'bg-purple-50 text-odoo-900 border-odoo-300 font-bold',
    odoo: 'bg-purple-50 text-odoo-900 border-odoo-300 font-bold',
    teal: 'bg-teal-50 text-teal-950 border-teal-300 font-bold',
    success: 'bg-emerald-50 text-emerald-950 border-emerald-400 font-bold',
    warning: 'bg-amber-50 text-amber-950 border-amber-400 font-bold',
    danger: 'bg-rose-50 text-rose-950 border-rose-300 font-bold',
    info: 'bg-sky-50 text-sky-950 border-sky-300 font-bold',
    purple: 'bg-purple-50 text-purple-950 border-purple-300 font-bold',
  };

  const dotColors = {
    neutral: 'bg-slate-600',
    default: 'bg-slate-600',
    primary: 'bg-odoo-600',
    odoo: 'bg-odoo-600',
    teal: 'bg-teal-600',
    success: 'bg-emerald-600',
    warning: 'bg-amber-600',
    danger: 'bg-rose-600',
    info: 'bg-sky-600',
    purple: 'bg-purple-600',
  };

  const sizes = {
    xs: 'text-[11px] px-2 py-0.5',
    sm: 'text-xs px-2.5 py-0.5',
    md: 'text-sm px-3 py-1',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border shadow-2xs font-bold leading-tight select-none whitespace-nowrap tracking-tight ${
        variants[variant] || variants.neutral
      } ${sizes[size] || sizes.sm} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant] || 'bg-slate-600'}`}
        />
      )}
      {children}
    </span>
  );
}
