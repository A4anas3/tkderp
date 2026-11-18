import React from 'react';

export default function Select({
  label,
  error,
  options = [],
  id,
  className = '',
  required = false,
  placeholder,
  ...props
}) {
  const selectId = id || props.name || Math.random().toString(36).substring(2, 9);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold text-black mb-1"
        >
          {label} {required && <span className="text-rose-600">*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 disabled:bg-slate-100 disabled:text-slate-500 shadow-sm ${
          error ? 'border-rose-500 focus:border-rose-600 focus:ring-rose-500' : ''
        } ${className}`}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => {
          const val = typeof opt === 'object' ? opt.value : opt;
          const lbl = typeof opt === 'object' ? opt.label : opt;
          return (
            <option key={val} value={val}>
              {lbl}
            </option>
          );
        })}
      </select>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
