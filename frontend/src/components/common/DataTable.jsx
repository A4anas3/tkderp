import React, { useState, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, RefreshCw } from 'lucide-react';

export default function DataTable({
  columns = [],
  data = [],
  total = 0,
  page = 1,
  pageSize = 15,
  onPageChange,
  onSearchChange,
  onRefresh,
  loading = false,
  searchValue = '',
  searchPlaceholder = 'Search records...',
  headerActions,
  emptyMessage = 'No records found.',
  onRowClick,
}) {
  const [localSearch, setLocalSearch] = useState(searchValue);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Sync external search value if changed
  useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  // Debounced search trigger (350ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== searchValue && onSearchChange) {
        onSearchChange(localSearch);
      }
    }, 350);
    return () => clearTimeout(handler);
  }, [localSearch, searchValue, onSearchChange]);

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden flex flex-col">
      {/* Odoo-style Search and Action Bar */}
      <div className="p-3 sm:p-3.5 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50/70">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm min-h-[36px] sm:min-h-[32px] border border-slate-300 rounded-md bg-white text-black placeholder:text-slate-400 focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto justify-end">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              title="Refresh table"
              className="min-h-[34px] min-w-[34px] p-1.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:text-black hover:bg-slate-50 active:bg-slate-100 transition flex items-center justify-center shrink-0 shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {headerActions}
        </div>
      </div>

      {/* Table container */}
      <div className="overflow-x-auto min-h-[200px] w-full -webkit-overflow-scrolling-touch">
        <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[620px] sm:min-w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100/80 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`px-3.5 py-2.5 whitespace-nowrap ${col.className || ''}`}
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-odoo-600" />
                    <span className="text-xs font-medium">Loading records...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-slate-500 text-xs sm:text-sm">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rIdx) => {
                const isClickable = typeof onRowClick === 'function';
                return (
                  <tr
                    key={row.id || rIdx}
                    onClick={(e) => {
                      if (!isClickable) return;
                      // Don't trigger row click if clicked on an interactive element
                      if (e.target.closest('button, a, input, select, textarea, [data-no-row-click]')) {
                        return;
                      }
                      onRowClick(row, rIdx);
                    }}
                    className={`transition-colors ${
                      isClickable
                        ? 'hover:bg-purple-50/50 cursor-pointer active:bg-purple-100/50'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {columns.map((col, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-3.5 py-2.5 text-black align-middle ${col.className || ''}`}
                      >
                        {col.render ? col.render(row, rIdx) : row[col.accessor] ?? '—'}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {total > 0 && onPageChange && (
        <div className="px-3.5 py-2.5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-slate-600">
          <div className="text-center sm:text-left">
            Showing <span className="font-semibold text-black">{(page - 1) * pageSize + 1}</span> to{' '}
            <span className="font-semibold text-black">{Math.min(page * pageSize, total)}</span> of{' '}
            <span className="font-semibold text-black">{total}</span> records
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(1)}
              disabled={page <= 1 || loading}
              className="min-h-[32px] min-w-[32px] p-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-2xs"
              title="First Page"
            >
              <ChevronsLeft className="w-3.5 h-3.5 text-black" />
            </button>
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || loading}
              className="min-h-[32px] min-w-[32px] p-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-2xs"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-black" />
            </button>

            <span className="px-2.5 py-1 text-xs font-semibold text-black bg-white border border-slate-200 rounded-md shadow-2xs">
              Page {page} of {totalPages}
            </span>

            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages || loading}
              className="min-h-[32px] min-w-[32px] p-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-2xs"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5 text-black" />
            </button>
            <button
              onClick={() => onPageChange(totalPages)}
              disabled={page >= totalPages || loading}
              className="min-h-[32px] min-w-[32px] p-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-2xs"
              title="Last Page"
            >
              <ChevronsRight className="w-3.5 h-3.5 text-black" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
