import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Phone, Award, X, UserPlus, Loader2, Check, FileText } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import { studentApi } from '../../services/allApis';

export default function StudentSearchSelect({
  value,
  onChange,
  onOpenQuickRegister,
  placeholder = 'Search registered student by Name, Mobile No, or Admission / Student No...',
  required = false,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const containerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Load selected student profile when value changes or mounts
  useEffect(() => {
    if (!value) {
      setSelectedStudent(null);
      return;
    }
    // If selectedStudent already matches value id, no need to re-fetch
    if (selectedStudent && selectedStudent.id === value) {
      return;
    }

    let isMounted = true;
    studentApi
      .get(value)
      .then((res) => {
        if (isMounted) setSelectedStudent(res);
      })
      .catch((err) => {
        console.error('Failed to fetch selected student:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [value]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Backend search with debounce (300ms)
  const performSearch = (searchTerm) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await studentApi.list({
          search: searchTerm.trim() || undefined,
          page: 1,
          page_size: 20,
        });
        setResults(res.items || []);
        setIsOpen(true);
      } catch (err) {
        console.error('Student backend search error:', err);
      } finally {
        setLoading(false);
      }
    }, 280);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    performSearch(val);
  };

  const handleInputFocus = () => {
    if (results.length === 0) {
      performSearch(query);
    } else {
      setIsOpen(true);
    }
  };

  const handleSelect = (student) => {
    setSelectedStudent(student);
    onChange(student.id, student);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = () => {
    setSelectedStudent(null);
    onChange('', null);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full space-y-1.5">
      {/* If student is selected, show selected summary card */}
      {selectedStudent ? (
        <div className="flex items-center justify-between p-2.5 rounded-lg border-2 border-indigo-500 bg-indigo-50/40 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
              {selectedStudent.name ? selectedStudent.name.charAt(0).toUpperCase() : 'S'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-black text-sm">{selectedStudent.name}</span>
                <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-white text-indigo-700 border border-indigo-200">
                  {selectedStudent.student_code}
                </span>
                {selectedStudent.latest_admission_number && (
                  <span className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <FileText className="w-3 h-3 text-emerald-700" />
                    Adm: {selectedStudent.latest_admission_number}
                  </span>
                )}
                {selectedStudent.has_green_card && (
                  <Badge variant="purple" size="xs">
                    GREEN CARD PASS
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-700 mt-0.5">
                {selectedStudent.mobile && (
                  <span className="flex items-center gap-1 font-mono text-black">
                    <Phone className="w-3 h-3 text-slate-500" />
                    {selectedStudent.mobile}
                  </span>
                )}
                {selectedStudent.father_name && (
                  <span className="text-slate-600">
                    Father: <strong className="text-black">{selectedStudent.father_name}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleClear}
              className="px-2 py-1 text-xs font-semibold rounded bg-white text-rose-700 hover:bg-rose-50 border border-slate-300 hover:border-rose-300 transition flex items-center gap-1"
              title="Change or remove selected student"
            >
              <X className="w-3.5 h-3.5 text-rose-600" />
              <span>Change</span>
            </button>
          </div>
        </div>
      ) : (
        /* Search Input when no student is selected */
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              ) : (
                <Search className="w-4 h-4 text-slate-600" />
              )}
            </div>
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              placeholder={placeholder}
              className="w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs sm:text-sm text-black placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-xs"
              required={required && !selectedStudent}
            />
          </div>

          {onOpenQuickRegister && (
            <Button
              type="button"
              variant="secondary"
              icon={UserPlus}
              onClick={onOpenQuickRegister}
              className="shrink-0 whitespace-nowrap"
            >
              New Student
            </Button>
          )}
        </div>
      )}

      {/* Dropdown Results Box */}
      {isOpen && !selectedStudent && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl divide-y divide-slate-100">
          <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-600 flex justify-between items-center border-b border-slate-200">
            <span>
              {loading ? 'Searching backend...' : `Found ${results.length} registered student(s)`}
            </span>
            <span className="text-[10px] text-slate-600">Search by Name, Mobile No, or Admission No</span>
          </div>

          {results.length === 0 ? (
            <div className="p-4 text-center space-y-2">
              <p className="text-xs text-slate-600">
                {query ? `No student found matching "${query}"` : 'No registered students found'}
              </p>
              {onOpenQuickRegister && (
                <Button
                  type="button"
                  size="xs"
                  variant="primary"
                  icon={UserPlus}
                  onClick={() => {
                    setIsOpen(false);
                    onOpenQuickRegister();
                  }}
                >
                  Register New Student Now
                </Button>
              )}
            </div>
          ) : (
            results.map((s) => (
              <div
                key={s.id}
                onClick={() => handleSelect(s)}
                className="p-2.5 hover:bg-indigo-50/70 cursor-pointer transition flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-300 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                    {s.name ? s.name.charAt(0).toUpperCase() : 'S'}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-black text-xs sm:text-sm">{s.name}</span>
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-indigo-700 border border-slate-300">
                        {s.student_code}
                      </span>
                      {s.latest_admission_number && (
                        <span className="font-mono text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <FileText className="w-2.5 h-2.5 text-emerald-700" />
                          Adm: {s.latest_admission_number}
                        </span>
                      )}
                      {s.has_green_card && (
                        <Badge variant="purple" size="xs">
                          GREEN CARD
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-700 mt-0.5">
                      {s.mobile && (
                        <span className="font-mono text-black font-medium">Mob: {s.mobile}</span>
                      )}
                      {s.father_name && (
                        <span className="text-slate-600">Father: {s.father_name}</span>
                      )}
                    </div>
                  </div>
                </div>

                <span className="text-[11px] text-indigo-600 font-semibold px-2 py-1 rounded hover:bg-indigo-100 shrink-0">
                  Select ➔
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
