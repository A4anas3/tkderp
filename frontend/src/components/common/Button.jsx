import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Button({
  children,
  variant = 'primary',
  size = 'sm',
  type = 'button',
  loading = false,
  disabled = false,
  className = '',
  icon: Icon,
  ...props
}) {
  const variants = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:bg-indigo-400',
    secondary: 'bg-white hover:bg-slate-50 text-black border border-slate-300 shadow-sm disabled:bg-slate-100 disabled:text-slate-400',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:bg-emerald-400',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm disabled:bg-rose-400',
    warning: 'bg-amber-500 hover:bg-amber-600 text-black shadow-sm font-semibold disabled:bg-amber-300',
    ghost: 'hover:bg-slate-100 text-slate-800 disabled:text-slate-400',
  };

  const sizes = {
    xs: 'py-1 px-2 text-xs rounded',
    sm: 'py-1.5 px-3 text-xs sm:text-sm rounded-md font-medium',
    md: 'py-2 px-4 text-sm rounded-md font-medium',
    lg: 'py-2.5 px-5 text-base rounded-md font-semibold',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 select-none ${
        variants[variant] || variants.primary
      } ${sizes[size] || sizes.sm} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : Icon ? (
        <Icon className="w-4 h-4 shrink-0" />
      ) : null}
      {children}
    </button>
  );
}
