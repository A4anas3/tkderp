import React, { useState } from 'react';
import { User } from 'lucide-react';

export default function Avatar({
  src,
  name = '',
  size = 'md',
  className = '',
  status = null, // 'ACTIVE' | 'REVOKED' | 'WARNING'
}) {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base font-bold',
    xl: 'w-20 h-20 text-xl font-bold',
  };

  const getInitials = (str) => {
    if (!str) return 'S';
    const parts = str.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const statusDotClasses = {
    ACTIVE: 'bg-emerald-500 ring-white',
    REVOKED: 'bg-rose-500 ring-white',
    WARNING: 'bg-amber-500 ring-white',
  };

  // Construct valid URL (handles relative /uploads/ and full URLs)
  const fullSrc = src && !src.startsWith('http') && !src.startsWith('data:')
    ? src
    : src;

  return (
    <div className={`relative inline-block shrink-0 ${className}`}>
      <div
        className={`${sizeClasses[size] || sizeClasses.md} rounded-full overflow-hidden flex items-center justify-center bg-slate-100 border border-slate-300 text-slate-800 shadow-2xs select-none`}
      >
        {fullSrc && !imgError ? (
          <img
            src={fullSrc}
            alt={name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-bold tracking-tight text-odoo-900">
            {name ? getInitials(name) : <User className="w-1/2 h-1/2 text-slate-400" />}
          </span>
        )}
      </div>

      {status && statusDotClasses[status] && (
        <span
          className={`absolute bottom-0 right-0 block w-2.5 h-2.5 rounded-full ring-2 ${statusDotClasses[status]}`}
        />
      )}
    </div>
  );
}
