import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import Button from './Button';

/**
 * Consistent always-visible server-side pagination footer for lists, cards, and detail sub-tables.
 * Displays record range and "Page X of Y" even on a single page or empty state.
 */
export default function PaginationBar({
  page = 1,
  pageSize = 50,
  total = 0,
  totalPages: propTotalPages,
  onPageChange,
  loading = false,
  itemLabel = 'records',
  compact = false,
  className = '',
}) {
  if (!onPageChange) return null;

  const safeTotal = Math.max(0, Number(total || 0));
  const safePageSize = Math.max(1, Number(pageSize || 50));
  const safeTotalPages = Math.max(
    1,
    Number(propTotalPages) || Math.ceil(safeTotal / safePageSize) || 1
  );
  const safePage = Math.min(Math.max(1, Number(page) || 1), safeTotalPages);
  const start = safeTotal === 0 ? 0 : (safePage - 1) * safePageSize + 1;
  const end = Math.min(safePage * safePageSize, safeTotal);

  if (compact) {
    return (
      <div
        className={`bg-white border border-slate-200 rounded-lg px-2.5 py-2 shadow-2xs flex items-center justify-between gap-2 text-xs ${className}`}
      >
        <span className="text-slate-600 font-medium">
          Page <span className="font-semibold text-black">{safePage}</span> of{' '}
          <span className="font-semibold text-black">{safeTotalPages}</span>
          {safeTotal > 0 ? (
            <span className="text-slate-400 ml-1.5">({safeTotal} {itemLabel})</span>
          ) : (
            <span className="text-slate-400 ml-1.5">(0 {itemLabel})</span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="secondary"
            disabled={safePage <= 1 || loading}
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
          >
            Previous
          </Button>
          <Button
            size="xs"
            variant="secondary"
            disabled={safePage >= safeTotalPages || loading}
            onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`px-3.5 py-2.5 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-slate-700 font-medium ${className}`}
    >
      <div className="text-center sm:text-left">
        Showing <span className="font-bold text-black">{start}</span> to{' '}
        <span className="font-bold text-black">{end}</span> of{' '}
        <span className="font-bold text-black">{safeTotal}</span> {itemLabel}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safePage <= 1 || loading}
          className="min-h-[32px] min-w-[32px] p-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
          title="First Page"
        >
          <ChevronsLeft className="w-3.5 h-3.5 text-black" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1 || loading}
          className="min-h-[32px] px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-semibold text-black transition-colors shadow-2xs cursor-pointer"
          title="Previous Page"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-black" />
          <span>Previous</span>
        </button>
        <span className="px-2.5 py-1 text-xs font-bold text-black bg-white border border-slate-300 rounded-md shadow-2xs whitespace-nowrap">
          Page {safePage} of {safeTotalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
          disabled={safePage >= safeTotalPages || loading}
          className="min-h-[32px] px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-semibold text-black transition-colors shadow-2xs cursor-pointer"
          title="Next Page"
        >
          <span>Next</span>
          <ChevronRight className="w-3.5 h-3.5 text-black" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(safeTotalPages)}
          disabled={safePage >= safeTotalPages || loading}
          className="min-h-[32px] min-w-[32px] p-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
          title="Last Page"
        >
          <ChevronsRight className="w-3.5 h-3.5 text-black" />
        </button>
      </div>
    </div>
  );
}
