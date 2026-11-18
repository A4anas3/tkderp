import React from 'react';

export default function Badge({ children, variant = 'neutral', size = 'sm', className = '' }) {
  const variants = {
    neutral: 'bg-slate-100 text-slate-800 border-slate-300',
    primary: 'bg-indigo-50 text-indigo-900 border-indigo-300',
    success: 'bg-emerald-50 text-emerald-900 border-emerald-300 font-semibold',
    warning: 'bg-amber-50 text-amber-950 border-amber-300 font-semibold',
    danger: 'bg-rose-50 text-rose-900 border-rose-300 font-semibold',
    info: 'bg-blue-50 text-blue-900 border-blue-300',
    purple: 'bg-purple-50 text-purple-900 border-purple-300',
  };

  const sizes = {
    xs: 'text-[11px] px-1.5 py-0.5',
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center rounded border font-medium ${variants[variant] || variants.neutral} ${
        sizes[size] || sizes.sm
      } ${className}`}
    >
      {children}
    </span>
  );
}
