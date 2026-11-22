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
      'btn-odoo-primary bg-odoo-600 hover:bg-odoo-700 active:bg-odoo-800 text-white shadow-2xs font-bold disabled:bg-odoo-300 disabled:cursor-not-allowed',
    secondary:
      'bg-white hover:bg-slate-100 hover:border-slate-400 active:bg-slate-200 text-black border border-slate-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed',
    teal:
      'btn-odoo-teal bg-odoo-teal hover:bg-odoo-teal-dark active:bg-teal-800 text-white shadow-2xs font-bold disabled:bg-teal-300 disabled:cursor-not-allowed',
    success:
      'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-2xs font-bold disabled:bg-emerald-300 disabled:cursor-not-allowed',
    danger:
      'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-2xs font-bold disabled:bg-rose-300 disabled:cursor-not-allowed',
    warning:
      'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 shadow-2xs font-bold disabled:bg-amber-300 disabled:cursor-not-allowed',
    ghost:
      'hover:bg-slate-100 active:bg-slate-200 text-black font-semibold disabled:text-slate-400 disabled:cursor-not-allowed',
    outline:
      'bg-transparent hover:bg-purple-50 text-odoo-800 border border-odoo-600 font-bold shadow-2xs disabled:border-slate-300 disabled:text-slate-400',

    // --- Semantic Soft Tinted Variants for Row Actions ---
    info:
      'bg-blue-50 hover:bg-blue-100 hover:border-blue-400 active:bg-blue-200 text-blue-700 border border-blue-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    blue:
      'bg-blue-50 hover:bg-blue-100 hover:border-blue-400 active:bg-blue-200 text-blue-700 border border-blue-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    amber:
      'bg-amber-50 hover:bg-amber-100 hover:border-amber-400 active:bg-amber-200 text-amber-800 border border-amber-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    edit:
      'bg-amber-50 hover:bg-amber-100 hover:border-amber-400 active:bg-amber-200 text-amber-800 border border-amber-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    'danger-soft':
      'bg-rose-50 hover:bg-rose-100 hover:border-rose-400 active:bg-rose-200 text-rose-700 border border-rose-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    red:
      'bg-rose-50 hover:bg-rose-100 hover:border-rose-400 active:bg-rose-200 text-rose-700 border border-rose-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    'success-soft':
      'bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400 active:bg-emerald-200 text-emerald-800 border border-emerald-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    emerald:
      'bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400 active:bg-emerald-200 text-emerald-800 border border-emerald-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    indigo:
      'bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-400 active:bg-indigo-200 text-indigo-800 border border-indigo-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    print:
      'bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-400 active:bg-indigo-200 text-indigo-800 border border-indigo-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    purple:
      'bg-purple-50 hover:bg-purple-100 hover:border-purple-400 active:bg-purple-200 text-purple-800 border border-purple-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    orange:
      'bg-orange-50 hover:bg-orange-100 hover:border-orange-400 active:bg-orange-200 text-orange-800 border border-orange-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    refund:
      'bg-orange-50 hover:bg-orange-100 hover:border-orange-400 active:bg-orange-200 text-orange-800 border border-orange-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    'teal-soft':
      'bg-teal-50 hover:bg-teal-100 hover:border-teal-400 active:bg-teal-200 text-teal-800 border border-teal-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    allocate:
      'bg-teal-50 hover:bg-teal-100 hover:border-teal-400 active:bg-teal-200 text-teal-800 border border-teal-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    whatsapp:
      'bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-500 active:bg-emerald-200 text-emerald-800 border border-emerald-400 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
    violet:
      'bg-violet-50 hover:bg-violet-100 hover:border-violet-400 active:bg-violet-200 text-violet-800 border border-violet-300 shadow-2xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed',
  };

  const sizes = {
    xs: 'h-8 min-h-[32px] py-1 px-2.5 text-xs sm:text-[13px] font-semibold rounded-md leading-none',
    sm: 'h-9 min-h-[36px] py-1.5 px-3.5 text-xs sm:text-sm font-bold rounded-md leading-none',
    md: 'h-10 min-h-[40px] py-2 px-4 text-sm font-bold rounded-lg',
    lg: 'h-11 min-h-[44px] py-2.5 px-5 text-base font-bold rounded-lg',
  };

  const iconSizes = {
    xs: 'w-3.5 h-3.5 shrink-0',
    sm: 'w-4 h-4 shrink-0',
    md: 'w-4 h-4 shrink-0',
    lg: 'w-5 h-5 shrink-0',
  };

  const currentIconClass = iconSizes[size] || 'w-4 h-4 shrink-0';

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-all touch-manipulation cursor-pointer active:scale-[0.98] disabled:active:scale-100 focus:outline-none focus:ring-2 focus:ring-odoo-500/30 focus:ring-offset-1 select-none ${
        variants[variant] || variants.primary
      } ${sizes[size] || sizes.sm} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className={`${currentIconClass} animate-spin`} />
      ) : Icon ? (
        <Icon className={currentIconClass} />
      ) : null}
      {children}
    </button>
  );
}
