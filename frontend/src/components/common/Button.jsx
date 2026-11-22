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
