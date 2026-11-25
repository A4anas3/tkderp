import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Search,
  RefreshCw,
  Eye,
  Printer,
  Calendar,
  BookOpen,
  User,
  MapPin,
  Phone,
  CheckCircle2,
  Clock,
  Filter,
  Layers,
  Sparkles,
  ExternalLink,
  X,
  FileText,
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import DemoPassModal from '../../components/modals/DemoPassModal';
import { enquiryApi, subjectApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { formatIndianDate } from '../../utils/dateCycleUtils';

export default function DemosPage() {
  const navigate = useNavigate();
  const { error } = useToast();
  const { role, isTeacher } = useAuth();

  const [demos, setDemos] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [detailItem, setDetailItem] = useState(null);
  const [slipModalItem, setSlipModalItem] = useState(null);

  // Helper to test if a demo item is strictly "Active"
  // Active demo means a demo item with status SCHEDULED or ATTENDED (or enquiry status ACTIVE_DEMO),
  // with demo_end_date today or later, and NOT CONVERTED, DROPPED or EXPIRED.
  const isActiveDemo = useCallback((item) => {
    if (!item) return false;
    const status = (item.status || '').toUpperCase();
    if (['CONVERTED', 'DROPPED', 'EXPIRED'].includes(status)) return false;
    if (item.converted_admission_item_id) return false;

    // Check end date >= today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (item.demo_end_date) {
      const parts = String(item.demo_end_date).split('T')[0].split('-');
      if (parts.length === 3) {
        const endDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        endDate.setHours(23, 59, 59, 999);
        if (endDate < today) return false;
      }
    }

    const enqStatus = (item.enquiry_status || '').toUpperCase();
    return ['SCHEDULED', 'ATTENDED'].includes(status) || enqStatus === 'ACTIVE_DEMO';
  }, []);

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 1. Fetch active demos (teachers receive only their own active demos from backend)
      const [demosRes, subjectsRes] = await Promise.allSettled([
        enquiryApi.listDemos({
          status_filter: 'ACTIVE',
          page_size: 100,
        }),
        subjectApi.getAll(isTeacher ? {} : { all_institute: true }),
      ]);

      let loadedDemos = [];
      if (demosRes.status === 'fulfilled' && demosRes.value) {
        const items = demosRes.value.items || demosRes.value || [];
        loadedDemos = items.filter(isActiveDemo);
      }
      setDemos(loadedDemos);

      // 2. Fetch subjects list across institute
      let loadedSubjects = [];
      if (subjectsRes.status === 'fulfilled' && subjectsRes.value) {
        loadedSubjects = subjectsRes.value || [];
      }

      // Also ensure any subject referenced in active demos is included in subjects list
      const seenSubjectIds = new Set(loadedSubjects.map((s) => String(s.id)));
      loadedDemos.forEach((d) => {
        if (d.subject_id && !seenSubjectIds.has(String(d.subject_id))) {
          seenSubjectIds.add(String(d.subject_id));
          loadedSubjects.push({
            id: d.subject_id,
            name: d.subject_name || d.subject_name_snapshot || 'Subject',
          });
        }
      });

      // Sort subjects alphabetically
      loadedSubjects.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setSubjects(loadedSubjects);
    } catch (err) {
      error(err.message || 'Failed to load active demos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [error, isActiveDemo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute subject-wise demo counts for pills
  const subjectCounts = useMemo(() => {
    const counts = {};
    demos.forEach((d) => {
      const sId = d.subject_id ? String(d.subject_id) : '';
      if (sId) {
        counts[sId] = (counts[sId] || 0) + 1;
      }
    });
    return counts;
  }, [demos]);

  // Filter demos by subject and search text
  const filteredDemos = useMemo(() => {
    return demos.filter((d) => {
      // Subject filter
      if (selectedSubjectId) {
        const dSubjectId = d.subject_id ? String(d.subject_id) : '';
        if (dSubjectId !== String(selectedSubjectId)) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const refNo = (d.demo_reference_number || '').toLowerCase();
        const sName = (d.student_name || '').toLowerCase();
        const mobile = (d.mobile || '').toLowerCase();
        const tName = (d.teacher_name || d.teacher_name_snapshot || '').toLowerCase();
        const subj = (d.subject_name || d.subject_name_snapshot || '').toLowerCase();
        const hall = (d.hall_number || d.hall_number_snapshot || '').toLowerCase();

        if (
          !refNo.includes(q) &&
          !sName.includes(q) &&
          !mobile.includes(q) &&
          !tName.includes(q) &&
          !subj.includes(q) &&
          !hall.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [demos, selectedSubjectId, searchQuery]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-odoo-700 flex items-center justify-center border border-purple-200">
              <ClipboardList className="w-5 h-5 text-[#714B67]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  Active Trial Demos
                </h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#714B67]/10 text-[#714B67] border border-[#714B67]/20">
                  {filteredDemos.length} Active
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  View Only
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isTeacher
                  ? 'Your active trial demo classes for your assigned subjects'
                  : 'Institute-wide live trial classes across all subjects and faculty members'}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Search & Refresh */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search candidate, demo ID, faculty..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer disabled:opacity-50 shrink-0"
            title="Refresh active demos"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-odoo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Subject-Wise Filter at the Top */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 pb-1 border-b border-slate-100">
          <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-odoo-600" />
            Subject-Wise Filter:
          </span>
          <span className="text-[11px]">
            Showing {filteredDemos.length} of {demos.length} total active trials
          </span>
        </div>

        {/* Filter Pills: All Subjects plus Each Subject */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setSelectedSubjectId('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              selectedSubjectId === ''
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <span>All Subjects</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                selectedSubjectId === ''
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 text-slate-800'
              }`}
            >
              {demos.length}
            </span>
          </button>

          {subjects.map((sub) => {
            const count = subjectCounts[String(sub.id)] || 0;
            const isSelected = String(selectedSubjectId) === String(sub.id);
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => setSelectedSubjectId(isSelected ? '' : String(sub.id))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-odoo-700 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>{sub.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : count > 0
                      ? 'bg-purple-100 text-odoo-800 font-bold'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Demos Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-odoo-600" />
            <span>Loading active trial demos...</span>
          </div>
        ) : filteredDemos.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">No Active Demos Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery || selectedSubjectId
                ? 'No trial classes match your subject or search criteria. Try selecting "All Subjects" or clearing the search.'
                : 'There are currently no active trial demo tickets recorded in the institute.'}
            </p>
            {(searchQuery || selectedSubjectId) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedSubjectId('');
                  setSearchQuery('');
                }}
                className="mt-2 px-3 py-1 text-xs font-semibold text-odoo-700 hover:text-odoo-900 bg-purple-50 hover:bg-purple-100 rounded-md border border-purple-200 cursor-pointer inline-flex items-center gap-1"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-3.5">Demo ID</th>
                  <th className="py-3 px-3.5">Student Name</th>
                  <th className="py-3 px-3.5">Subject</th>
                  <th className="py-3 px-3.5">Assigned Teacher</th>
                  <th className="py-3 px-3.5">Hall / Room</th>
                  <th className="py-3 px-3.5">Demo Dates</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDemos.map((d) => {
                  const daysLeft =
                    d.days_remaining !== undefined && d.days_remaining !== null
                      ? d.days_remaining
                      : d.remaining_days;

                  return (
                    <tr
                      key={d.demo_item_id || d.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => setDetailItem(d)}
                    >
                      {/* 1. Demo ID */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-odoo-900 inline-block">
                          {d.demo_reference_number}
                        </span>
                        {d.enquiry_code && (
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            Enquiry: {d.enquiry_code}
                          </span>
                        )}
                      </td>

                      {/* 2. Student Name */}
                      <td className="py-3 px-3.5">
                        <span className="font-bold text-slate-900 block group-hover:text-odoo-700 transition-colors">
                          {d.student_name}
                        </span>
                        {d.mobile ? (
                          <span className="font-mono text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {d.mobile}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>

                      {/* 3. Subject */}
                      <td className="py-3 px-3.5">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-odoo-600 shrink-0" />
                          <span>{d.subject_name || d.subject_name_snapshot || 'Academic Subject'}</span>
                        </span>
                      </td>

                      {/* 4. Teacher */}
                      <td className="py-3 px-3.5">
                        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{d.teacher_name || d.teacher_name_snapshot || 'Assigned Faculty'}</span>
                        </span>
                      </td>

                      {/* 5. Hall */}
                      <td className="py-3 px-3.5">
                        <span className="text-slate-700 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{d.hall_number || d.hall_number_snapshot || 'Main Hall'}</span>
                        </span>
                      </td>

                      {/* 6. Demo Dates */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-800 text-xs">
                          {formatIndianDate(d.demo_start_date)}
                          {d.demo_end_date && ` → ${formatIndianDate(d.demo_end_date)}`}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <span>{d.demo_duration_days || 3} days</span>
                          {daysLeft !== null && daysLeft !== undefined && (
                            <span
                              className={`font-semibold px-1.5 py-0.2 rounded text-[10px] ${
                                daysLeft === 0
                                  ? 'bg-amber-100 text-amber-800'
                                  : daysLeft > 0
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 7. Status */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <Badge
                          size="xs"
                          variant={
                            d.status === 'ATTENDED'
                              ? 'info'
                              : d.status === 'SCHEDULED' || d.status === 'ACTIVE'
                              ? 'success'
                              : 'primary'
                          }
                        >
                          {d.status === 'SCHEDULED' ? 'Active Demo' : d.status}
                        </Badge>
                      </td>

                      {/* 8. Actions (View Only) */}
                      <td
                        className="py-3 px-3.5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="xs"
                            variant="secondary"
                            icon={Eye}
                            onClick={() => setDetailItem(d)}
                            title="View Demo Details"
                          >
                            View
                          </Button>

                          <Button
                            size="xs"
                            variant="indigo"
                            icon={Printer}
                            onClick={() => {
                              setSlipModalItem({
                                id: d.enquiry_id,
                                student_name: d.student_name,
                                mobile: d.mobile,
                                created_at: d.created_at,
                                status: d.status,
                                demo_reference_number: d.demo_reference_number,
                                subject_name_snapshot: d.subject_name || d.subject_name_snapshot,
                                teacher_name_snapshot: d.teacher_name || d.teacher_name_snapshot,
                                hall_number_snapshot: d.hall_number || d.hall_number_snapshot,
                                demo_start_date: d.demo_start_date,
                                demo_end_date: d.demo_end_date,
                                demo_duration_days: d.demo_duration_days,
                              });
                            }}
                            title="Print Official Trial Demo Pass / Slip"
                          >
                            Slip
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* READ-ONLY DEMO DETAIL MODAL FOR TEACHERS */}
      {/* ========================================================= */}
      {detailItem && (
        <Modal
          isOpen={!!detailItem}
          onClose={() => setDetailItem(null)}
          title="Active Trial Demo Details"
          subtitle={`Demo ID: ${detailItem.demo_reference_number}`}
          maxWidth="max-w-xl"
        >
          <div className="space-y-4">
            {/* Top Status Header */}
            <div className="p-3.5 rounded-lg border bg-purple-50 border-purple-200 text-odoo-950 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Clock className="w-5 h-5 text-odoo-600 shrink-0" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-odoo-900">
                      Live Active Trial Pass
                    </span>
                    <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-white border border-purple-300 text-odoo-900">
                      {detailItem.demo_reference_number}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                    Trial window ends on {formatIndianDate(detailItem.demo_end_date)}
                  </div>
                </div>
              </div>
              <Badge size="sm" variant="success">
                {detailItem.status === 'SCHEDULED' ? 'Active Demo' : detailItem.status}
              </Badge>
            </div>

            {/* Candidate Info Card */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2 text-xs">
              <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block">
                Candidate Details
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-slate-500 block">Student Name</span>
                  <span className="font-bold text-slate-900">{detailItem.student_name}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Contact Mobile</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {detailItem.mobile || '—'}
                  </span>
                </div>
                {detailItem.father_name && (
                  <div>
                    <span className="text-[11px] text-slate-500 block">Father's Name</span>
                    <span className="font-medium text-slate-800">{detailItem.father_name}</span>
                  </div>
                )}
                {detailItem.school_college && (
                  <div>
                    <span className="text-[11px] text-slate-500 block">School / College</span>
                    <span className="font-medium text-slate-800">{detailItem.school_college}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Trial Class Subject & Schedule */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2 text-xs">
              <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block">
                Trial Class Schedule
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-slate-500 block">Subject</span>
                  <span className="font-bold text-slate-900 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-odoo-600" />
                    {detailItem.subject_name || detailItem.subject_name_snapshot || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Assigned Faculty</span>
                  <span className="font-bold text-slate-900 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    {detailItem.teacher_name || detailItem.teacher_name_snapshot || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Classroom / Hall</span>
                  <span className="font-bold text-slate-900 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    {detailItem.hall_number || detailItem.hall_number_snapshot || 'Main Hall'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Trial Window</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatIndianDate(detailItem.demo_start_date)} → {formatIndianDate(detailItem.demo_end_date)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes if any */}
            {detailItem.notes && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                <span className="font-bold text-slate-700 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Counselor / Trial Notes:</span>
                </span>
                <p className="text-slate-700 whitespace-pre-wrap">{detailItem.notes}</p>
              </div>
            )}

            {/* Read-Only Notice */}
            <div className="bg-amber-50/80 p-2.5 rounded-lg border border-amber-200/80 text-[11px] text-amber-900 flex items-center gap-2">
              <span className="font-semibold">Notice:</span>
              <span>
                {isTeacher ? 'Teachers have' : 'Staff have'} read-only access to demo passes here. Status changes and student conversions are handled by administrative staff.
              </span>
            </div>

            {/* Actions (View Only & Print) */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <Button
                size="sm"
                variant="indigo"
                icon={Printer}
                onClick={() => {
                  setSlipModalItem({
                    id: detailItem.enquiry_id,
                    student_name: detailItem.student_name,
                    mobile: detailItem.mobile,
                    created_at: detailItem.created_at,
                    status: detailItem.status,
                    demo_reference_number: detailItem.demo_reference_number,
                    subject_name_snapshot: detailItem.subject_name || detailItem.subject_name_snapshot,
                    teacher_name_snapshot: detailItem.teacher_name || detailItem.teacher_name_snapshot,
                    hall_number_snapshot: detailItem.hall_number || detailItem.hall_number_snapshot,
                    demo_start_date: detailItem.demo_start_date,
                    demo_end_date: detailItem.demo_end_date,
                    demo_duration_days: detailItem.demo_duration_days,
                  });
                }}
              >
                Print Demo Pass
              </Button>

              <div className="flex items-center gap-2">
                {detailItem.enquiry_id && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={ExternalLink}
                    onClick={() => {
                      setDetailItem(null);
                      navigate(`/demos/${detailItem.enquiry_id}`);
                    }}
                    title="Open full enquiry record"
                  >
                    Open Record
                  </Button>
                )}

                <Button size="sm" variant="secondary" onClick={() => setDetailItem(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================= */}
      {/* PRINT DEMO PASS / SLIP MODAL */}
      {/* ========================================================= */}
      {slipModalItem && (
        <DemoPassModal
          isOpen={!!slipModalItem}
          onClose={() => setSlipModalItem(null)}
          enquiry={slipModalItem}
          demoItem={slipModalItem}
        />
      )}
    </div>
  );
}
