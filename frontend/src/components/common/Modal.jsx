import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-lg',
  showClose = true,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative w-full ${maxWidth} bg-white h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl shadow-2xl border-0 sm:border border-slate-200 overflow-hidden transform transition-all z-10 flex flex-col`}
      >
        {/* Header */}
        {(title || showClose) && (
          <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 sm:py-3.5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div className="min-w-0 flex-1 pr-2">
              {title && <h3 className="text-sm sm:text-base font-bold text-black break-words leading-tight">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{subtitle}</p>}
            </div>
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="text-slate-500 hover:text-black hover:bg-slate-200/70 active:bg-slate-200 rounded-lg p-2 transition min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
