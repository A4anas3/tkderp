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
    primary:
      'bg-odoo-600 hover:bg-odoo-700 active:bg-odoo-800 text-white shadow-2xs font-semibold disabled:bg-odoo-300 disabled:cursor-not-allowed',
    secondary:
      'bg-white hover:bg-slate-50 active:bg-slate-100 text-black border border-slate-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed',
    teal:
      'bg-odoo-teal hover:bg-odoo-teal-dark active:bg-teal-800 text-white shadow-2xs font-semibold disabled:bg-teal-300 disabled:cursor-not-allowed',
    success:
      'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-2xs font-semibold disabled:bg-emerald-300 disabled:cursor-not-allowed',
    danger:
      'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-2xs font-semibold disabled:bg-rose-300 disabled:cursor-not-allowed',
    warning:
      'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-2xs font-semibold disabled:bg-amber-300 disabled:cursor-not-allowed',
    ghost:
      'hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-medium disabled:text-slate-400 disabled:cursor-not-allowed',
    outline:
      'bg-transparent hover:bg-purple-50 text-odoo-700 border border-odoo-600 font-semibold shadow-2xs disabled:border-slate-300 disabled:text-slate-400',
  };

  const sizes = {
    xs: 'min-h-[34px] sm:min-h-[28px] py-1 px-2.5 text-xs rounded-md font-medium',
    sm: 'min-h-[38px] sm:min-h-[32px] py-1.5 px-3 text-xs sm:text-sm rounded-md font-medium',
    md: 'min-h-[42px] sm:min-h-[38px] py-2 px-4 text-sm rounded-md font-medium',
    lg: 'min-h-[46px] sm:min-h-[42px] py-2.5 px-5 text-base rounded-md font-semibold',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-odoo-500 focus:ring-offset-1 select-none ${
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
