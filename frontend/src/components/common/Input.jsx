import React from 'react';

export default function Input({
  label,
  error,
  helperText,
  id,
  className = '',
  required = false,
  ...props
}) {
  const inputId = id || props.name || Math.random().toString(36).substring(2, 9);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-bold text-black mb-1.5"
        >
          {label} {required && <span className="text-rose-600">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-md border bg-white px-3 py-2 text-xs sm:text-sm min-h-[38px] sm:min-h-[34px] text-black font-medium placeholder:text-slate-500 focus:outline-none focus:ring-1 disabled:bg-slate-100 disabled:text-slate-600 shadow-2xs transition-colors ${
          error
            ? 'border-rose-500 focus:border-rose-600 focus:ring-rose-500'
            : 'border-slate-300 focus:border-blue-600 focus:ring-blue-600'
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-rose-700 font-bold">{error}</p>}
      {helperText && !error && <p className="mt-1 text-xs text-slate-700 font-semibold">{helperText}</p>}
    </div>
  );
}
