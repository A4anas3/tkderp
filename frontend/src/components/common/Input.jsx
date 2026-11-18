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
          className="block text-xs font-semibold text-black mb-1"
        >
          {label} {required && <span className="text-rose-600">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-black placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 disabled:bg-slate-100 disabled:text-slate-500 shadow-sm ${
          error ? 'border-rose-500 focus:border-rose-600 focus:ring-rose-500' : ''
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      {helperText && !error && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}
    </div>
  );
}
