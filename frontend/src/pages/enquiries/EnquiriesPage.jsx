import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Phone,
  UserCheck,
  Calendar,
  Filter,
  ExternalLink,
  Edit2,
  BookOpen,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  XCircle,
  MoreHorizontal,
  Users,
  RotateCcw,
  ChevronDown,
  Printer,
  Hash,
  MapPin,
  User,
  Trash2,
  BarChart3,
  TrendingUp,
  Award,
  Layers,
  Search,
} from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import EnquiryDetailModal from '../../components/modals/EnquiryDetailModal';
import DemoPassModal from '../../components/modals/DemoPassModal';
import { enquiryApi, subjectApi, teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { cleanMobileInput } from '../../utils/phoneUtils';
import { formatIndianDate } from '../../utils/dateCycleUtils';

export default function EnquiriesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { success, error } = useToast();

  // Active Main View Tab: 'enquiries' | 'demos' | 'analytics'
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'enquiries');

  // Month & Year Filter (100% Backend-Driven across all views)
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Reference Catalogs
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [availableTeachers, setAvailableTeachers] = useState([]);

  // ==========================================
  // TAB 1: ALL ENQUIRIES STATE
  // ==========================================
  const [enquiries, setEnquiries] = useState([]);
  const [enquiryTotal, setEnquiryTotal] = useState(0);
  const [enquiryPage, setEnquiryPage] = useState(1);
  const [enquirySearch, setEnquirySearch] = useState('');
  const [enquiryStatusFilter, setEnquiryStatusFilter] = useState('');
  const [enquiriesLoading, setEnquiriesLoading] = useState(true);

  // Summary counts
  const [summary, setSummary] = useState({
    total: 0,
    ACTIVE_DEMO: 0,
    INTERESTED: 0,
    PENDING: 0,
    CONVERTED: 0,
    EXPIRED: 0,
    NOT_INTERESTED: 0,
  });

  // Action Menu dropdown state
  const [activeActionMenuId, setActiveActionMenuId] = useState(null);

  // Deadlines widget data
  const [deadlines, setDeadlines] = useState([]);
  const [deadlinesLoading, setDeadlinesLoading] = useState(true);

  // Modals
  const [detailEnquiry, setDetailEnquiry] = useState(null);
  const [passModalEnquiry, setPassModalEnquiry] = useState(null);
  const [passModalDemoItem, setPassModalDemoItem] = useState(null);

  // ==========================================
  // TAB 2: DEMO REGISTER STATE
  // ==========================================
  const [demos, setDemos] = useState([]);
  const [demoTotal, setDemoTotal] = useState(0);
  const [demoPage, setDemoPage] = useState(1);
  const [demoSearch, setDemoSearch] = useState('');
  const [demoStatusFilter, setDemoStatusFilter] = useState('');
  const [demoTeacherFilter, setDemoTeacherFilter] = useState('');
  const [demoSubjectFilter, setDemoSubjectFilter] = useState('');
  const [demosLoading, setDemosLoading] = useState(false);

  // Demo item status modal (Attended / Dropped)
  const [demoStatusModalOpen, setDemoStatusModalOpen] = useState(false);
  const [selectedDemoItem, setSelectedDemoItem] = useState(null);
  const [targetDemoStatus, setTargetDemoStatus] = useState('ATTENDED');
  const [demoDropReason, setDemoDropReason] = useState('Fee too high / Budget issue');
  const [demoStatusNotes, setDemoStatusNotes] = useState('');
  const [updatingDemoStatus, setUpdatingDemoStatus] = useState(false);

  // ==========================================
  // TAB 3: DEMO ANALYTICS STATE
  // ==========================================
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // ==========================================
  // ADD ENQUIRY & MULTI-SUBJECT DEMO CART MODAL
  // ==========================================
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [enquiryForm, setEnquiryForm] = useState({
    student_name: '',
    mobile: '',
    purpose: 'Class 9-10 Coaching Trial',
    status: 'ACTIVE_DEMO',
    notes: '',
  });

  // Multi-Subject Demo Items Cart
  const [demoCart, setDemoCart] = useState([]);
  const [cartDraft, setCartDraft] = useState({
    subject_id: '',
    teacher_id: '',
    hall_number_snapshot: 'Main Hall',
    demo_start_date: new Date().toISOString().split('T')[0],
    demo_duration_days: 3,
  });

  // Quick Change / Update Interested Course Modal
  const [courseUpdateModalOpen, setCourseUpdateModalOpen] = useState(false);
  const [selectedCourseEnquiry, setSelectedCourseEnquiry] = useState(null);
  const [courseFormData, setCourseFormData] = useState({
    interested_subject: '',
    purpose: '',
    demo_start_date: '',
    demo_duration_days: 3,
    status: 'ACTIVE_DEMO',
    notes: '',
  });
  const [courseUpdating, setCourseUpdating] = useState(false);

  // Not Interested Modal for Enquiries
  const [notInterestedModalOpen, setNotInterestedModalOpen] = useState(false);
  const [targetNotInterestedEnquiry, setTargetNotInterestedEnquiry] = useState(null);
  const [dropReason, setDropReason] = useState('Fee too high / Budget issue');
  const [customDropNotes, setCustomDropNotes] = useState('');
  const [markingStatus, setMarkingStatus] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveActionMenuId(null);
    };
    if (activeActionMenuId) {
      document.addEventListener('click', handleGlobalClick);
      return () => document.removeEventListener('click', handleGlobalClick);
    }
  }, [activeActionMenuId]);

  // Sync activeTab with URL param
  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setSearchParams({ tab: tabKey });
  };

  // Load Reference Catalogs (Subjects & Teachers)
  useEffect(() => {
    Promise.all([subjectApi.getAll(), teacherApi.list({ page_size: 100 })])
      .then(([subs, teachRes]) => {
        setAvailableSubjects(subs || []);
        setAvailableTeachers(teachRes?.items || teachRes || []);
      })
      .catch((err) => console.warn('Failed to load subjects or teachers:', err));
  }, []);

  // When subject changes in cart draft, auto-populate default teacher & hall
  const handleCartSubjectChange = (subjectId) => {
    const foundSub = availableSubjects.find((s) => s.id === subjectId);
    if (foundSub) {
      setCartDraft((prev) => ({
        ...prev,
        subject_id: subjectId,
        teacher_id: foundSub.teacher_id || prev.teacher_id || '',
        hall_number_snapshot: foundSub.hall_number || 'Main Hall',
      }));
    } else {
      setCartDraft((prev) => ({ ...prev, subject_id: subjectId }));
    }
  };

  const handleAddSubjectToCart = () => {
    if (!cartDraft.subject_id) {
      error('Please select a subject to add to the trial pass');
      return;
    }
    const foundSub = availableSubjects.find((s) => s.id === cartDraft.subject_id);
    const foundTeacher = availableTeachers.find((t) => t.id === cartDraft.teacher_id);

    const exists = demoCart.some((item) => item.subject_id === cartDraft.subject_id);
    if (exists) {
      error('This subject is already added to the demo cart');
      return;
    }

    const startDate = cartDraft.demo_start_date || new Date().toISOString().split('T')[0];
    const duration = parseInt(cartDraft.demo_duration_days, 10) || 3;
    const endD = new Date(startDate);
    endD.setDate(endD.getDate() + duration);
    const endDateStr = endD.toISOString().split('T')[0];

    const newItem = {
      tempId: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      subject_id: cartDraft.subject_id,
      subject_name_snapshot: foundSub?.name || 'Academic Subject',
      teacher_id: cartDraft.teacher_id || foundSub?.teacher_id || null,
      teacher_name_snapshot: foundTeacher?.name || foundSub?.teacher_name_snapshot || 'Assigned Faculty',
      hall_number_snapshot: cartDraft.hall_number_snapshot || foundSub?.hall_number || 'Main Hall',
      demo_start_date: startDate,
      demo_end_date: endDateStr,
      demo_duration_days: duration,
      notes: '',
    };

    setDemoCart((prev) => [...prev, newItem]);
    success(`Added ${newItem.subject_name_snapshot} to demo list!`);
  };

  const handleRemoveCartItem = (tempId) => {
    setDemoCart((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  // Load Enquiries (Tab 1)
  const loadEnquiries = useCallback(async () => {
    setEnquiriesLoading(true);
    try {
      const res = await enquiryApi.list({
        page: enquiryPage,
        page_size: 15,
        search: enquirySearch.trim() || undefined,
        status_filter: enquiryStatusFilter || undefined,
        status: enquiryStatusFilter || undefined,
        month: selectedMonth ? parseInt(selectedMonth, 10) : undefined,
        year: selectedYear ? parseInt(selectedYear, 10) : undefined,
      });
      setEnquiries(res.items || []);
      setEnquiryTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load enquiries');
    } finally {
      setEnquiriesLoading(false);
    }
  }, [enquiryPage, enquirySearch, enquiryStatusFilter, selectedMonth, selectedYear, error]);

  const loadSummary = useCallback(async () => {
    try {
      const s = await enquiryApi.getSummary();
      if (s) setSummary(s);
    } catch (err) {
      console.warn('Failed to load enquiry summary:', err);
    }
  }, []);

  const loadDeadlines = useCallback(async () => {
    setDeadlinesLoading(true);
    try {
      const res = await enquiryApi.getUpcomingDeadlines();
      setDeadlines(res || []);
    } catch (err) {
      console.error('Failed to load upcoming demo deadlines:', err);
    } finally {
      setDeadlinesLoading(false);
    }
  }, []);

  // Load Demos Register (Tab 2)
  const loadDemos = useCallback(async () => {
    setDemosLoading(true);
    try {
      const res = await enquiryApi.listDemos({
        page: demoPage,
        page_size: 15,
        search: demoSearch.trim() || undefined,
        status: demoStatusFilter || undefined,
        teacher_id: demoTeacherFilter || undefined,
        subject_id: demoSubjectFilter || undefined,
        month: selectedMonth ? parseInt(selectedMonth, 10) : undefined,
        year: selectedYear ? parseInt(selectedYear, 10) : undefined,
      });
      setDemos(res.items || []);
      setDemoTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load demo register');
    } finally {
      setDemosLoading(false);
    }
  }, [demoPage, demoSearch, demoStatusFilter, demoTeacherFilter, demoSubjectFilter, selectedMonth, selectedYear, error]);

  // Load Demo Analytics (Tab 3)
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await enquiryApi.getAnalytics({
        month: selectedMonth ? parseInt(selectedMonth, 10) : undefined,
        year: selectedYear ? parseInt(selectedYear, 10) : undefined,
      });
      setAnalyticsData(res);
    } catch (err) {
      error(err.message || 'Failed to load demo analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [selectedMonth, selectedYear, error]);

  // Tab-dependent data fetching
  useEffect(() => {
    if (activeTab === 'enquiries') {
      loadEnquiries();
      loadSummary();
      loadDeadlines();
    } else if (activeTab === 'demos') {
      loadDemos();
    } else if (activeTab === 'analytics') {
      loadAnalytics();
    }
  }, [activeTab, loadEnquiries, loadSummary, loadDeadlines, loadDemos, loadAnalytics]);

  // Create Enquiry with Multi-Subject Cart
  const handleCreateEnquiry = async (e) => {
    e.preventDefault();
    if (!enquiryForm.student_name.trim()) {
      error('Student name is required');
      return;
    }

    if (enquiryForm.mobile) {
      const clean = cleanMobileInput(enquiryForm.mobile);
      if (clean.length !== 10 || !/^\d{10}$/.test(clean)) {
        error('Contact mobile must be exactly 10 numeric digits');
        return;
      }
    }

    setSubmitting(true);
    try {
      const cleanMob = enquiryForm.mobile ? cleanMobileInput(enquiryForm.mobile) : null;

      // Construct demo_items payload from cart
      const demoItemsPayload = demoCart.map((c) => ({
        subject_id: c.subject_id,
        teacher_id: c.teacher_id,
        hall_number_snapshot: c.hall_number_snapshot,
        subject_name_snapshot: c.subject_name_snapshot,
        teacher_name_snapshot: c.teacher_name_snapshot,
        demo_start_date: c.demo_start_date,
        demo_end_date: c.demo_end_date,
        demo_duration_days: c.demo_duration_days,
        notes: c.notes || null,
      }));

      // Interested subject summary text
      const subjectSummary = demoCart.length > 0
        ? demoCart.map((c) => c.subject_name_snapshot).join(', ')
        : 'General Coaching Trial';

      const firstCartItem = demoCart[0];

      const payload = {
        student_name: enquiryForm.student_name.trim(),
        mobile: cleanMob || null,
        purpose: enquiryForm.purpose.trim() || null,
        interested_subject: subjectSummary,
        demo_start_date: firstCartItem?.demo_start_date || new Date().toISOString().split('T')[0],
        demo_duration_days: firstCartItem?.demo_duration_days || 3,
        status: enquiryForm.status,
        notes: enquiryForm.notes.trim() || null,
        demo_items: demoItemsPayload,
      };

      const res = await enquiryApi.create(payload);
      success(`Enquiry & ${res.demo_items?.length || 1} Subject Demo Reference Slip(s) created for ${res.student_name}!`);

      setAddModalOpen(false);
      setEnquiryForm({
        student_name: '',
        mobile: '',
        purpose: 'Class 9-10 Coaching Trial',
        status: 'ACTIVE_DEMO',
        notes: '',
      });
      setDemoCart([]);

      // Prompt to view / print demo slip
      setPassModalEnquiry(res);

      if (activeTab === 'enquiries') {
        loadEnquiries();
        loadSummary();
        loadDeadlines();
      } else if (activeTab === 'demos') {
        loadDemos();
      } else {
        loadAnalytics();
      }
    } catch (err) {
      error(err.message || 'Failed to create enquiry');
    } finally {
      setSubmitting(false);
    }
  };

  // Update Individual Demo Item Status (from Demo Register tab)
  const handleOpenDemoStatusModal = (item, newStatus, ev) => {
    if (ev) ev.stopPropagation();
    setSelectedDemoItem(item);
    setTargetDemoStatus(newStatus);
    setDemoDropReason('Fee too high / Budget issue');
    setDemoStatusNotes('');
    setDemoStatusModalOpen(true);
  };

  const handleSaveDemoStatus = async (e) => {
    e.preventDefault();
    if (!selectedDemoItem) return;

    setUpdatingDemoStatus(true);
    try {
      const payload = {
        status: targetDemoStatus,
        drop_reason: targetDemoStatus === 'DROPPED' ? demoDropReason : null,
        notes: demoStatusNotes.trim() || null,
      };

      const demoId = selectedDemoItem.demo_item_id || selectedDemoItem.id;
      await enquiryApi.updateDemoStatus(demoId, payload);
      success(`Updated demo #${selectedDemoItem.demo_reference_number} to ${targetDemoStatus}`);
      setDemoStatusModalOpen(false);
      setSelectedDemoItem(null);
      loadDemos();
      if (activeTab === 'analytics') loadAnalytics();
    } catch (err) {
      error(err.message || 'Failed to update demo item status');
    } finally {
      setUpdatingDemoStatus(false);
    }
  };

  // Convert to Admission / Course Purchase
  const handleConvertToAdmission = (enq, ev, specificSubject = null) => {
    if (ev) ev.stopPropagation();
    const subParam = specificSubject || enq.interested_subject || '';
    const stuParam = enq.converted_student_id ? `&student_id=${enq.converted_student_id}` : '';
    navigate(
      `/admissions/new?enquiry_id=${enq.id}${stuParam}&name=${encodeURIComponent(
        enq.student_name
      )}&mobile=${encodeURIComponent(enq.mobile || '')}&subject=${encodeURIComponent(
        subParam
      )}&purpose=${encodeURIComponent(enq.purpose || '')}&auto_register=1`
    );
  };

  const handleMarkInterested = async (enq, ev) => {
    if (ev) ev.stopPropagation();
    try {
      const updatedNotes = enq.notes
        ? `${enq.notes} • [Post-Demo: Student is Interested]`
        : '[Post-Demo: Student is Interested in Admission]';
      await enquiryApi.update(enq.id, {
        status: 'INTERESTED',
        notes: updatedNotes,
      });
      success(`${enq.student_name} marked as INTERESTED! Ready for admission.`);
      loadEnquiries();
      loadDeadlines();
      loadSummary();
    } catch (err) {
      error(err.message || 'Failed to update status');
    }
  };

  const handleOpenCourseUpdate = (enq, ev) => {
    if (ev) ev.stopPropagation();
    setSelectedCourseEnquiry(enq);
    setCourseFormData({
      interested_subject: enq.interested_subject || '',
      purpose: enq.purpose || '',
      demo_start_date: enq.demo_start_date || '',
      demo_duration_days: enq.demo_duration_days || 3,
      status: enq.status || 'ACTIVE_DEMO',
      notes: enq.notes || '',
    });
    setCourseUpdateModalOpen(true);
  };

  const handleSaveCourseUpdate = async (e) => {
    e.preventDefault();
    if (!courseFormData.interested_subject.trim()) {
      error('Interested course / subject is required');
      return;
    }

    setCourseUpdating(true);
    try {
      await enquiryApi.update(selectedCourseEnquiry.id, {
        interested_subject: courseFormData.interested_subject.trim(),
        purpose: courseFormData.purpose.trim() || null,
        demo_start_date: courseFormData.demo_start_date || null,
        demo_duration_days: parseInt(courseFormData.demo_duration_days, 10) || 3,
        status: courseFormData.status,
        notes: courseFormData.notes ? courseFormData.notes.trim() : null,
      });
      success(`Updated interested course for ${selectedCourseEnquiry.student_name}`);
      setCourseUpdateModalOpen(false);
      loadEnquiries();
      loadDeadlines();
      loadSummary();
    } catch (err) {
      error(err.message || 'Failed to update interested subject');
    } finally {
      setCourseUpdating(false);
    }
  };

  const handleOpenNotInterestedModal = (enq, ev) => {
    if (ev) ev.stopPropagation();
    setTargetNotInterestedEnquiry(enq);
    setDropReason('Fee too high / Budget issue');
    setCustomDropNotes('');
    setNotInterestedModalOpen(true);
  };

  const handleConfirmNotInterested = async (e) => {
    e.preventDefault();
    if (!targetNotInterestedEnquiry) return;
    setMarkingStatus(true);
    try {
      const noteSummary = customDropNotes?.trim()
        ? `[Not Interested: ${dropReason} - ${customDropNotes.trim()}]`
        : `[Not Interested: ${dropReason}]`;
      const combinedNotes = targetNotInterestedEnquiry.notes
        ? `${targetNotInterestedEnquiry.notes} • ${noteSummary}`
        : noteSummary;

      await enquiryApi.update(targetNotInterestedEnquiry.id, {
        status: 'NOT_INTERESTED',
        notes: combinedNotes,
      });
      success(`${targetNotInterestedEnquiry.student_name} marked as Not Interested.`);
      setNotInterestedModalOpen(false);
      setTargetNotInterestedEnquiry(null);
      loadEnquiries();
      loadDeadlines();
      loadSummary();
    } catch (err) {
      error(err.message || 'Failed to update status');
    } finally {
      setMarkingStatus(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  // ==========================================
  // TAB 1: ALL ENQUIRIES COLUMNS
  // ==========================================
  const enquiryColumns = [
    {
      header: 'Student Name',
      render: (e) => (
        <div>
          <span className="font-bold text-black block">{e.student_name}</span>
          <span className="text-[11px] text-slate-500">{e.purpose || 'General Enquiry'}</span>
        </div>
      ),
    },
    {
      header: 'Interested Course / Subject(s)',
      className: 'text-xs font-medium text-slate-800',
      render: (e) => {
        const demoCount = e.demo_items?.length || 0;
        return (
          <div className="flex items-center justify-between gap-1 group">
            <div>
              <div className="font-bold text-black flex items-center gap-1.5">
                <span>{e.interested_subject}</span>
                {demoCount > 1 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-purple-50 border border-purple-200 text-odoo-700 text-[10px] font-bold">
                    {demoCount} Demos
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {e.purpose || 'Coaching Trial'}
              </div>
            </div>
            <button
              onClick={(ev) => handleOpenCourseUpdate(e, ev)}
              title="Change / Update Interested Subject & Trial Details"
              className="p-1 rounded text-odoo-600 hover:text-odoo-800 hover:bg-purple-50 border border-transparent hover:border-purple-200 transition cursor-pointer shrink-0"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      },
    },
    {
      header: 'Contact Phone',
      render: (e) =>
        e.mobile ? (
          <span className="flex items-center gap-1 font-mono text-xs text-slate-700">
            <Phone className="w-3 h-3 text-slate-400" />
            {e.mobile}
          </span>
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        ),
    },
    {
      header: 'Demo Period',
      render: (e) =>
        e.demo_start_date ? (
          <div className="text-xs">
            <span className="text-slate-500">Starts: </span>
            <span className="font-mono text-black">{e.demo_start_date}</span>
            <span className="text-[11px] text-slate-500 block">
              Duration: {e.demo_duration_days} days
            </span>
          </div>
        ) : (
          <span className="text-slate-400 text-xs">No demo</span>
        ),
    },
    {
      header: 'Demo Deadline',
      render: (e) => {
        if (!e.demo_deadline) return <span className="text-slate-400 text-xs">—</span>;
        const isExpired = e.demo_deadline < today;
        const isToday = e.demo_deadline === today;
        return (
          <div className="text-xs">
            <span
              className={`font-mono font-bold ${
                isExpired ? 'text-rose-700' : isToday ? 'text-amber-700' : 'text-slate-800'
              }`}
            >
              {e.demo_deadline}
            </span>
            {isExpired && (
              <span className="text-[10px] text-rose-600 block font-semibold">Demo Over</span>
            )}
            {isToday && (
              <span className="text-[10px] text-amber-600 block font-semibold">Expires Today</span>
            )}
          </div>
        );
      },
    },
    {
      header: 'Status',
      className: 'text-center w-36',
      render: (e) => {
        const isConverted = e.status === 'CONVERTED';
        const hasCourse = Boolean(e.has_course_purchase);
        const hasStudent = Boolean(e.has_student_admission) || Boolean(e.converted_student_id);

        if (isConverted || hasStudent) {
          if (hasCourse) {
            return (
              <div>
                <Badge size="xs" variant="success">
                  Course Enrolled ✓
                </Badge>
                {e.converted_student_code && (
                  <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                    {e.converted_student_code}
                  </span>
                )}
              </div>
            );
          } else {
            return (
              <div>
                <Badge size="xs" variant="primary">
                  Admitted (No Course)
                </Badge>
                <span className="text-[10px] text-amber-700 block font-semibold mt-0.5">
                  {e.converted_student_code || 'Student Registered'}
                </span>
              </div>
            );
          }
        }

        const variants = {
          ACTIVE_DEMO: 'primary',
          INTERESTED: 'success',
          PENDING: 'warning',
          EXPIRED: 'danger',
          NOT_INTERESTED: 'neutral',
        };
        const labels = {
          ACTIVE_DEMO: 'Active Demo',
          INTERESTED: '👍 Interested',
          PENDING: 'Pending',
          EXPIRED: 'Expired',
          NOT_INTERESTED: 'Not Interested',
        };
        return (
          <Badge size="xs" variant={variants[e.status] || 'neutral'}>
            {labels[e.status] || e.status.replace('_', ' ')}
          </Badge>
        );
      },
    },
    {
      header: 'Action',
      className: 'text-right w-56',
      render: (e) => {
        const isConverted = e.status === 'CONVERTED';
        const hasCourse = Boolean(e.has_course_purchase);
        const hasStudent = Boolean(e.has_student_admission) || Boolean(e.converted_student_id);
        const isMenuOpen = activeActionMenuId === e.id;

        return (
          <div className="flex items-center justify-end gap-1.5 relative">
            <Button
              size="xs"
              variant="indigo"
              icon={Printer}
              onClick={(ev) => {
                ev.stopPropagation();
                setPassModalEnquiry(e);
                setPassModalDemoItem(null);
              }}
              title="Print Demo Trial Pass / Slip"
            >
              Slip
            </Button>

            {hasCourse ? (
              <>
                <Badge size="xs" variant="success">
                  Course Paid ✓
                </Badge>
                <Button
                  size="xs"
                  variant="info"
                  icon={ExternalLink}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (e.course_admission_id) {
                      navigate(`/admissions/${e.course_admission_id}`);
                    } else {
                      navigate(`/enquiries/${e.id}`);
                    }
                  }}
                  title="View Course Bill"
                >
                  Bill ↗
                </Button>
              </>
            ) : hasStudent || isConverted ? (
              <>
                <Button
                  size="xs"
                  variant="primary"
                  onClick={(ev) => handleConvertToAdmission(e, ev)}
                  title="Student is registered! Click to purchase course and collect fees"
                >
                  Buy Course ↗
                </Button>
                <Button
                  size="xs"
                  variant="info"
                  icon={ExternalLink}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    navigate(`/enquiries/${e.id}`);
                  }}
                  title="View Full Details"
                >
                  Detail ↗
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="xs"
                  variant="primary"
                  onClick={(ev) => handleConvertToAdmission(e, ev)}
                  title="Convert to Admission & Collect Fees"
                >
                  Admit
                </Button>

                {/* More actions menu */}
                <div className="relative">
                  <button
                    type="button"
                    data-no-row-click
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setActiveActionMenuId(isMenuOpen ? null : e.id);
                    }}
                    className={`p-1.5 rounded border transition cursor-pointer flex items-center justify-center ${
                      isMenuOpen
                        ? 'bg-purple-50 border-odoo-400 text-odoo-700'
                        : 'bg-white border-slate-300 text-slate-700 hover:text-black hover:bg-slate-50'
                    }`}
                    title="More actions"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>

                  {isMenuOpen && (
                    <div
                      data-no-row-click
                      onClick={(ev) => ev.stopPropagation()}
                      className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-30 text-xs divide-y divide-slate-100"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveActionMenuId(null);
                          navigate(`/enquiries/${e.id}`);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        <span>View Details</span>
                      </button>

                      <button
                        type="button"
                        onClick={(ev) => {
                          setActiveActionMenuId(null);
                          setPassModalEnquiry(e);
                          setPassModalDemoItem(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-odoo-600" />
                        <span>Print Trial Pass Slip</span>
                      </button>

                      <button
                        type="button"
                        onClick={(ev) => {
                          setActiveActionMenuId(null);
                          handleOpenCourseUpdate(e, ev);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-odoo-600" />
                        <span>Update Subject</span>
                      </button>

                      {e.status !== 'INTERESTED' && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            setActiveActionMenuId(null);
                            handleMarkInterested(e, ev);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 flex items-center gap-2 text-emerald-700 font-semibold cursor-pointer"
                        >
                          <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Mark as Interested</span>
                        </button>
                      )}

                      {e.status !== 'NOT_INTERESTED' ? (
                        <button
                          type="button"
                          onClick={(ev) => {
                            setActiveActionMenuId(null);
                            handleOpenNotInterestedModal(e, ev);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-rose-50 flex items-center gap-2 text-rose-700 font-medium cursor-pointer"
                        >
                          <ThumbsDown className="w-3.5 h-3.5 text-rose-500" />
                          <span>Not Interested / Drop</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(ev) => {
                            setActiveActionMenuId(null);
                            handleMarkInterested(e, ev);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-purple-50 flex items-center gap-2 text-odoo-700 font-medium cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-odoo-600" />
                          <span>Re-activate Enquiry</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      },
    },
  ];

  // ==========================================
  // TAB 2: DEMO REGISTER COLUMNS
  // ==========================================
  const demoColumns = [
    {
      header: 'Demo Reference #',
      render: (d) => (
        <div>
          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-odoo-900 inline-block">
            {d.demo_reference_number}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Ref ID: #{(d.demo_item_id || d.id)?.slice(0, 8)}
          </span>
        </div>
      ),
    },
    {
      header: 'Candidate / Student',
      render: (d) => (
        <div>
          <span className="font-bold text-black block">{d.student_name}</span>
          {d.mobile ? (
            <span className="font-mono text-xs text-slate-600 flex items-center gap-1">
              <Phone className="w-3 h-3 text-slate-400" />
              {d.mobile}
            </span>
          ) : (
            <span className="text-slate-400 text-xs">—</span>
          )}
        </div>
      ),
    },
    {
      header: 'Subject & Room',
      render: (d) => (
        <div>
          <span className="font-bold text-black text-xs block">
            {d.subject_name || d.subject_name_snapshot || 'Academic Subject'}
          </span>
          <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3 text-slate-400" />
            {d.hall_number || d.hall_number_snapshot || 'Main Hall'}
          </span>
        </div>
      ),
    },
    {
      header: 'Assigned Faculty',
      render: (d) => (
        <div>
          <span className="font-semibold text-black text-xs flex items-center gap-1">
            <User className="w-3 h-3 text-odoo-600" />
            {d.teacher_name || d.teacher_name_snapshot || 'Assigned Faculty'}
          </span>
        </div>
      ),
    },
    {
      header: 'Trial Window & Days',
      render: (d) => {
        const daysLeft = d.days_remaining !== undefined && d.days_remaining !== null
          ? d.days_remaining
          : d.remaining_days;
        return (
          <div className="text-xs">
            <span className="font-mono font-bold text-black">
              {formatIndianDate(d.demo_start_date)}
              {d.demo_end_date && ` → ${formatIndianDate(d.demo_end_date)}`}
            </span>
            <span className="text-[11px] text-slate-500 block">
              Duration: {d.demo_duration_days} days
              {daysLeft !== null && daysLeft !== undefined && (
                <span className={`ml-1 font-semibold ${daysLeft < 0 ? 'text-rose-600' : 'text-odoo-600'}`}>
                  ({daysLeft < 0 ? 'Expired' : `${daysLeft}d left`})
                </span>
              )}
            </span>
          </div>
        );
      },
    },
    {
      header: 'Status',
      className: 'text-center w-28',
      render: (d) => {
        const variants = {
          ACTIVE: 'primary',
          ATTENDED: 'warning',
          CONVERTED: 'success',
          DROPPED: 'neutral',
          EXPIRED: 'danger',
        };
        return (
          <div>
            <Badge size="xs" variant={variants[d.status] || 'neutral'}>
              {d.status}
            </Badge>
            {d.drop_reason && (
              <span className="text-[10px] text-slate-500 block truncate max-w-[120px]" title={d.drop_reason}>
                {d.drop_reason}
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: 'Actions',
      className: 'text-right w-52 whitespace-nowrap',
      render: (d) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <Button
            size="xs"
            variant="indigo"
            icon={Printer}
            onClick={() => {
              setPassModalEnquiry({
                id: d.enquiry_id,
                student_name: d.student_name,
                mobile: d.mobile,
                created_at: d.created_at,
                status: d.status,
              });
              setPassModalDemoItem(d);
            }}
            title="Print Demo Slip for this subject"
          >
            Slip
          </Button>

          {d.status === 'ACTIVE' && (
            <>
              <Button
                size="xs"
                variant="success-soft"
                onClick={(ev) => handleOpenDemoStatusModal(d, 'ATTENDED', ev)}
                title="Mark demo as attended"
              >
                Attended ✓
              </Button>
              <Button
                size="xs"
                variant="danger-soft"
                onClick={(ev) => handleOpenDemoStatusModal(d, 'DROPPED', ev)}
                title="Mark demo as dropped"
              >
                Drop
              </Button>
            </>
          )}

          {d.status === 'ATTENDED' && (
            <>
              <Button
                size="xs"
                variant="primary"
                onClick={(ev) =>
                  handleConvertToAdmission(
                    {
                      id: d.enquiry_id,
                      student_name: d.student_name,
                      mobile: d.mobile,
                    },
                    ev,
                    d.subject_name_snapshot
                  )
                }
                title="Convert to full admission"
              >
                Admit
              </Button>
              <Button
                size="xs"
                variant="danger-soft"
                onClick={(ev) => handleOpenDemoStatusModal(d, 'DROPPED', ev)}
                title="Mark demo as dropped"
              >
                Drop
              </Button>
            </>
          )}

          {d.status === 'CONVERTED' && (
            <Badge size="xs" variant="success">
              Enrolled ✓
            </Badge>
          )}

          {(d.status === 'DROPPED' || d.status === 'EXPIRED') && (
            <Button
              size="xs"
              variant="teal-soft"
              onClick={(ev) => handleOpenDemoStatusModal(d, 'ACTIVE', ev)}
              title="Re-open demo class"
            >
              Re-open
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-black tracking-tight">
              Enquiries & Trial Demo Classes
            </h1>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-odoo-700 border border-purple-200 px-2 py-0.5 rounded-full">
              Multi-Subject Demo Tracking
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage student walk-ins, print official trial passes with reference numbers, and track faculty conversion metrics
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="primary" icon={Plus} onClick={() => setAddModalOpen(true)}>
            New Enquiry / Demo Pass
          </Button>
        </div>
      </div>

      {/* Main View Tabs (Segmented Control) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleTabChange('enquiries')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'enquiries'
                ? 'bg-white text-black shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-black hover:bg-slate-200/60'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-odoo-600" />
            <span>All Enquiries</span>
            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded-full text-[10px] font-black border border-slate-200">
              {summary.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('demos')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'demos'
                ? 'bg-white text-black shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-black hover:bg-slate-200/60'
            }`}
          >
            <Hash className="w-3.5 h-3.5 text-emerald-600" />
            <span>Subject Demos & Slips</span>
            {demoTotal > 0 && (
              <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-800 rounded-full text-[10px] font-black border border-emerald-200">
                {demoTotal}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('analytics')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-white text-black shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-black hover:bg-slate-200/60'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-amber-600" />
            <span>Faculty & Subject Analytics</span>
          </button>
        </div>

        {/* Global Month & Year Filter Toolbar (Pushed 100% to backend) */}
        <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-slate-200 text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-[11px] font-bold text-slate-600">Period:</span>

          <select
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setEnquiryPage(1);
              setDemoPage(1);
            }}
            className="text-xs font-semibold text-black bg-slate-50 border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
          >
            <option value="">All Months</option>
            <option value="1">January</option>
            <option value="2">February</option>
            <option value="3">March</option>
            <option value="4">April</option>
            <option value="5">May</option>
            <option value="6">June</option>
            <option value="7">July</option>
            <option value="8">August</option>
            <option value="9">September</option>
            <option value="10">October</option>
            <option value="11">November</option>
            <option value="12">December</option>
          </select>

          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(e.target.value);
              setEnquiryPage(1);
              setDemoPage(1);
            }}
            className="text-xs font-semibold text-black bg-slate-50 border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
          >
            <option value="">All Years</option>
            <option value={currentYear}>{currentYear}</option>
            <option value={currentYear - 1}>{currentYear - 1}</option>
            <option value={currentYear - 2}>{currentYear - 2}</option>
          </select>

          {(selectedMonth || (selectedYear && selectedYear !== currentYear)) && (
            <button
              onClick={() => {
                setSelectedMonth('');
                setSelectedYear(currentYear);
                setEnquiryPage(1);
                setDemoPage(1);
              }}
              title="Reset month/year filters"
              className="p-1 rounded text-slate-400 hover:text-black hover:bg-slate-100 transition"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* VIEW TAB 1: ALL ENQUIRIES */}
      {/* ========================================================= */}
      {activeTab === 'enquiries' && (
        <div className="space-y-4">
          {/* Pipeline Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div
              onClick={() => {
                setEnquiryStatusFilter('');
                setEnquiryPage(1);
              }}
              className={`p-2.5 rounded-lg border transition cursor-pointer ${
                enquiryStatusFilter === ''
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${enquiryStatusFilter === '' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Total Leads
                </span>
                <Users className={`w-3.5 h-3.5 ${enquiryStatusFilter === '' ? 'text-white' : 'text-slate-400'}`} />
              </div>
              <div className={`text-lg font-black mt-0.5 ${enquiryStatusFilter === '' ? 'text-white' : 'text-black'}`}>
                {summary.total}
              </div>
            </div>

            <div
              onClick={() => {
                setEnquiryStatusFilter('ACTIVE_DEMO');
                setEnquiryPage(1);
              }}
              className={`p-2.5 rounded-lg border transition cursor-pointer ${
                enquiryStatusFilter === 'ACTIVE_DEMO'
                  ? 'bg-odoo-600 text-white border-odoo-600 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-odoo-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${enquiryStatusFilter === 'ACTIVE_DEMO' ? 'text-indigo-100' : 'text-odoo-700'}`}>
                  Active Demos
                </span>
                <Clock className={`w-3.5 h-3.5 ${enquiryStatusFilter === 'ACTIVE_DEMO' ? 'text-white' : 'text-odoo-600'}`} />
              </div>
              <div className={`text-lg font-black mt-0.5 ${enquiryStatusFilter === 'ACTIVE_DEMO' ? 'text-white' : 'text-odoo-900'}`}>
                {summary.ACTIVE_DEMO}
              </div>
            </div>

            <div
              onClick={() => {
                setEnquiryStatusFilter('INTERESTED');
                setEnquiryPage(1);
              }}
              className={`p-2.5 rounded-lg border transition cursor-pointer ${
                enquiryStatusFilter === 'INTERESTED'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${enquiryStatusFilter === 'INTERESTED' ? 'text-emerald-100' : 'text-emerald-700'}`}>
                  Interested
                </span>
                <ThumbsUp className={`w-3.5 h-3.5 ${enquiryStatusFilter === 'INTERESTED' ? 'text-white' : 'text-emerald-500'}`} />
              </div>
              <div className={`text-lg font-black mt-0.5 ${enquiryStatusFilter === 'INTERESTED' ? 'text-white' : 'text-emerald-900'}`}>
                {summary.INTERESTED}
              </div>
            </div>

            <div
              onClick={() => {
                setEnquiryStatusFilter('PENDING');
                setEnquiryPage(1);
              }}
              className={`p-2.5 rounded-lg border transition cursor-pointer ${
                enquiryStatusFilter === 'PENDING'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${enquiryStatusFilter === 'PENDING' ? 'text-amber-100' : 'text-amber-700'}`}>
                  Pending Demo
                </span>
                <Calendar className={`w-3.5 h-3.5 ${enquiryStatusFilter === 'PENDING' ? 'text-white' : 'text-amber-500'}`} />
              </div>
              <div className={`text-lg font-black mt-0.5 ${enquiryStatusFilter === 'PENDING' ? 'text-white' : 'text-amber-900'}`}>
                {summary.PENDING}
              </div>
            </div>

            <div
              onClick={() => {
                setEnquiryStatusFilter('CONVERTED');
                setEnquiryPage(1);
              }}
              className={`p-2.5 rounded-lg border transition cursor-pointer ${
                enquiryStatusFilter === 'CONVERTED'
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${enquiryStatusFilter === 'CONVERTED' ? 'text-emerald-100' : 'text-emerald-800'}`}>
                  Admitted
                </span>
                <CheckCircle2 className={`w-3.5 h-3.5 ${enquiryStatusFilter === 'CONVERTED' ? 'text-white' : 'text-emerald-600'}`} />
              </div>
              <div className={`text-lg font-black mt-0.5 ${enquiryStatusFilter === 'CONVERTED' ? 'text-white' : 'text-emerald-950'}`}>
                {summary.CONVERTED}
              </div>
            </div>

            <div
              onClick={() => {
                setEnquiryStatusFilter('NOT_INTERESTED');
                setEnquiryPage(1);
              }}
              className={`p-2.5 rounded-lg border transition cursor-pointer ${
                enquiryStatusFilter === 'NOT_INTERESTED'
                  ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${enquiryStatusFilter === 'NOT_INTERESTED' ? 'text-slate-200' : 'text-slate-600'}`}>
                  Dropped / Other
                </span>
                <XCircle className={`w-3.5 h-3.5 ${enquiryStatusFilter === 'NOT_INTERESTED' ? 'text-white' : 'text-slate-400'}`} />
              </div>
              <div className={`text-lg font-black mt-0.5 ${enquiryStatusFilter === 'NOT_INTERESTED' ? 'text-white' : 'text-slate-700'}`}>
                {summary.NOT_INTERESTED + summary.EXPIRED}
              </div>
            </div>
          </div>

          {/* Urgent Demo Deadlines Section */}
          {deadlines.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-300 rounded-lg p-3 sm:p-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-amber-200/80 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-black">
                    Urgent Demo Deadlines — Trial Classes Expiring Soon
                  </h2>
                </div>
                <span className="text-[11px] text-amber-900 font-bold bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                  {deadlines.length} Requiring Decision
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {deadlines.map((d) => {
                  const isOverdue = d.demo_deadline < today;
                  const isToday = d.demo_deadline === today;
                  const isInterested = d.status === 'INTERESTED';
                  return (
                    <div
                      key={d.id}
                      className={`p-3 rounded-lg border text-xs flex flex-col justify-between bg-white ${
                        isInterested
                          ? 'border-emerald-300'
                          : isOverdue
                          ? 'border-rose-300'
                          : isToday
                          ? 'border-amber-400'
                          : 'border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-black text-sm">{d.student_name}</span>
                          <Badge
                            size="xs"
                            variant={
                              isInterested
                                ? 'success'
                                : isOverdue
                                ? 'danger'
                                : isToday
                                ? 'warning'
                                : 'primary'
                            }
                          >
                            {isInterested
                              ? '👍 Interested'
                              : isOverdue
                              ? 'Expired'
                              : isToday
                              ? 'Ends Today'
                              : 'Active'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[11px] text-slate-600">
                            Subject: <strong className="text-black">{d.interested_subject || 'General'}</strong>
                          </p>
                          <button
                            onClick={(ev) => handleOpenCourseUpdate(d, ev)}
                            className="text-[10px] font-bold text-odoo-700 hover:text-odoo-900 bg-purple-50 hover:bg-purple-100 px-1.5 py-0.5 rounded border border-purple-200 inline-flex items-center gap-0.5 cursor-pointer ml-1"
                            title="Change / Update Interested Subject"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                            <span>Change</span>
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Deadline: <strong className="font-mono text-black">{d.demo_deadline}</strong>
                        </p>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                        <span className="text-[11px] font-mono text-slate-600 shrink-0">
                          {d.mobile || 'No Phone'}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            size="xs"
                            variant="indigo"
                            icon={Printer}
                            onClick={() => {
                              setPassModalEnquiry(d);
                              setPassModalDemoItem(null);
                            }}
                            title="Print trial pass slip"
                          >
                            Slip
                          </Button>
                          {!isInterested && (
                            <Button
                              size="xs"
                              variant="success-soft"
                              onClick={(ev) => handleMarkInterested(d, ev)}
                              title="Student completed demo and liked it"
                            >
                              👍 Interested
                            </Button>
                          )}
                          <Button
                            size="xs"
                            variant="danger-soft"
                            onClick={(ev) => handleOpenNotInterestedModal(d, ev)}
                            title="Student not interested / drop"
                          >
                            👎 Drop
                          </Button>
                          <Button
                            size="xs"
                            variant="primary"
                            onClick={() => handleConvertToAdmission(d)}
                            title="Convert to full student admission"
                          >
                            Admit ↗
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status Filter Tabs with Counts */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {[
              { label: 'All Enquiries', value: '', count: summary.total },
              { label: 'Active Demo', value: 'ACTIVE_DEMO', count: summary.ACTIVE_DEMO },
              { label: 'Interested', value: 'INTERESTED', count: summary.INTERESTED },
              { label: 'Pending Demo', value: 'PENDING', count: summary.PENDING },
              { label: 'Converted to Admission', value: 'CONVERTED', count: summary.CONVERTED },
              { label: 'Expired Demo', value: 'EXPIRED', count: summary.EXPIRED },
              { label: 'Not Interested', value: 'NOT_INTERESTED', count: summary.NOT_INTERESTED },
            ].map((tab) => {
              const isActive = enquiryStatusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => {
                    setEnquiryStatusFilter(tab.value);
                    setEnquiryPage(1);
                  }}
                  className={`px-3 py-1 text-xs rounded-full border transition font-medium flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-odoo-600 text-white border-odoo-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      isActive
                        ? 'bg-purple-500 text-white'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {tab.count ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Enquiries Table */}
          <DataTable
            columns={enquiryColumns}
            data={enquiries}
            total={enquiryTotal}
            page={enquiryPage}
            pageSize={15}
            onPageChange={(p) => setEnquiryPage(p)}
            searchValue={enquirySearch}
            onSearchChange={(val) => {
              setEnquirySearch(val);
              setEnquiryPage(1);
            }}
            onRefresh={loadEnquiries}
            loading={enquiriesLoading}
            onRowClick={(e) => navigate(`/enquiries/${e.id}`)}
            searchPlaceholder="Search enquiry by student name or mobile..."
            emptyMessage="No enquiry records found for this filter."
          />
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW TAB 2: SUBJECT DEMOS & PASSES REGISTER */}
      {/* ========================================================= */}
      {activeTab === 'demos' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-black uppercase tracking-wider text-[11px] flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-odoo-600" />
                Filter Demos:
              </span>

              {/* Status filter pills */}
              {[
                { label: 'All', value: '' },
                { label: 'Active', value: 'ACTIVE' },
                { label: 'Attended', value: 'ATTENDED' },
                { label: 'Admitted', value: 'CONVERTED' },
                { label: 'Dropped', value: 'DROPPED' },
                { label: 'Expired', value: 'EXPIRED' },
              ].map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => {
                    setDemoStatusFilter(s.value);
                    setDemoPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                    demoStatusFilter === s.value
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Teacher filter */}
              <select
                value={demoTeacherFilter}
                onChange={(e) => {
                  setDemoTeacherFilter(e.target.value);
                  setDemoPage(1);
                }}
                className="p-1.5 rounded-lg border border-slate-300 text-xs text-black font-medium bg-slate-50 focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
              >
                <option value="">All Faculty / Teachers</option>
                {availableTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              {/* Subject filter */}
              <select
                value={demoSubjectFilter}
                onChange={(e) => {
                  setDemoSubjectFilter(e.target.value);
                  setDemoPage(1);
                }}
                className="p-1.5 rounded-lg border border-slate-300 text-xs text-black font-medium bg-slate-50 focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
              >
                <option value="">All Subjects</option>
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Demos DataTable */}
          <DataTable
            columns={demoColumns}
            data={demos}
            total={demoTotal}
            page={demoPage}
            pageSize={15}
            onPageChange={(p) => setDemoPage(p)}
            searchValue={demoSearch}
            onSearchChange={(val) => {
              setDemoSearch(val);
              setDemoPage(1);
            }}
            onRefresh={loadDemos}
            loading={demosLoading}
            searchPlaceholder="Search by reference number (e.g. DEM-2026-0001), student, or teacher..."
            emptyMessage="No trial demo records found matching criteria."
          />
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW TAB 3: FACULTY & SUBJECT ANALYTICS */}
      {/* ========================================================= */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          {analyticsLoading ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-xs text-slate-500 animate-pulse">
              Computing faculty conversion metrics and subject demo volumes...
            </div>
          ) : analyticsData ? (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <span>Total Demos</span>
                    <Hash className="w-3.5 h-3.5 text-odoo-600" />
                  </div>
                  <div className="text-xl font-black text-black mt-1">
                    {analyticsData.summary?.total_demos || 0}
                  </div>
                  <span className="text-[10px] text-slate-500">Scheduled tickets</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-odoo-600 text-[10px] font-bold uppercase tracking-wider">
                    <span>Active Trials</span>
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xl font-black text-odoo-900 mt-1">
                    {analyticsData.summary?.active_demos || 0}
                  </div>
                  <span className="text-[10px] text-odoo-600">In trial period</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-amber-700 text-[10px] font-bold uppercase tracking-wider">
                    <span>Attended</span>
                    <UserCheck className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xl font-black text-amber-900 mt-1">
                    {analyticsData.summary?.attended_demos || 0}
                  </div>
                  <span className="text-[10px] text-amber-600">Completed demo</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                    <span>Admitted</span>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xl font-black text-emerald-950 mt-1">
                    {analyticsData.summary?.converted_admissions ?? analyticsData.summary?.converted_demos ?? 0}
                  </div>
                  <span className="text-[10px] text-emerald-600">Converted to course</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-rose-700 text-[10px] font-bold uppercase tracking-wider">
                    <span>Dropped</span>
                    <XCircle className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xl font-black text-rose-950 mt-1">
                    {analyticsData.summary?.dropped_demos || 0}
                  </div>
                  <span className="text-[10px] text-rose-600">Did not enroll</span>
                </div>

                <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xs border border-slate-800">
                  <div className="flex items-center justify-between text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                    <span>Conversion %</span>
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-black text-white mt-1">
                    {analyticsData.summary?.overall_conversion_rate?.toFixed(1) || '0.0'}%
                  </div>
                  <span className="text-[10px] text-slate-300">Conversion efficiency</span>
                </div>
              </div>

              {/* Teacher Demo Performance Leaderboard */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div>
                    <h3 className="font-bold text-black text-sm flex items-center gap-2">
                      <Award className="w-4 h-4 text-odoo-600" />
                      <span>Faculty Demo Performance & Conversion Leaderboard</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Teacher-wise metrics computed at database level from individual demo tickets
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
                  <table className="w-full text-xs text-left min-w-[650px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Faculty Member</th>
                        <th className="py-2.5 px-3 text-center">Total Demos</th>
                        <th className="py-2.5 px-3 text-center">Active</th>
                        <th className="py-2.5 px-3 text-center">Attended</th>
                        <th className="py-2.5 px-3 text-center text-emerald-800">Admitted</th>
                        <th className="py-2.5 px-3 text-center text-rose-800">Dropped</th>
                        <th className="py-2.5 px-4 text-right">Conversion Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analyticsData.by_teacher?.length > 0 ? (
                        analyticsData.by_teacher.map((t, idx) => {
                          const rate = t.conversion_rate_percentage !== undefined ? t.conversion_rate_percentage : (t.conversion_rate || 0);
                          const admittedCount = t.converted_admissions !== undefined ? t.converted_admissions : (t.converted_demos || 0);
                          return (
                            <tr key={t.teacher_id || idx} className="hover:bg-slate-50/70 transition">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-full bg-purple-50 border border-purple-200 text-odoo-700 font-bold flex items-center justify-center text-xs shrink-0">
                                    {t.teacher_name?.slice(0, 2).toUpperCase() || 'TR'}
                                  </div>
                                  <div>
                                    <span className="font-bold text-black block">{t.teacher_name}</span>
                                    <span className="text-[10px] text-slate-500">
                                      Faculty Profile ID: {t.teacher_id ? t.teacher_id.slice(0, 8) : '—'}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-black">
                                {t.total_demos}
                              </td>
                              <td className="py-3 px-3 text-center font-semibold text-odoo-700">
                                {t.active_demos}
                              </td>
                              <td className="py-3 px-3 text-center font-semibold text-amber-700">
                                {t.attended_demos}
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-emerald-800 bg-emerald-50/40">
                                {admittedCount}
                              </td>
                              <td className="py-3 px-3 text-center font-semibold text-rose-700">
                                {t.dropped_demos}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden hidden sm:block border border-slate-200">
                                    <div
                                      className={`h-full rounded-full ${
                                        rate >= 50
                                          ? 'bg-emerald-600'
                                          : rate >= 25
                                          ? 'bg-odoo-600'
                                          : 'bg-amber-500'
                                      }`}
                                      style={{ width: `${Math.min(100, rate)}%` }}
                                    ></div>
                                  </div>
                                  <span
                                    className={`font-mono font-black text-xs ${
                                      rate >= 50
                                        ? 'text-emerald-800'
                                        : rate >= 25
                                        ? 'text-odoo-800'
                                        : 'text-amber-800'
                                    }`}
                                  >
                                    {rate.toFixed(1)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400">
                            No faculty demo records for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Subject-Wise Demo Breakdown */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div>
                    <h3 className="font-bold text-black text-sm flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-odoo-600" />
                      <span>Subject-Wise Trial Volume & Admission Conversion</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Conversion rate per subject course domain
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
                  <table className="w-full text-xs text-left min-w-[650px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Subject Domain</th>
                        <th className="py-2.5 px-3 text-center">Total Demos</th>
                        <th className="py-2.5 px-3 text-center">Active</th>
                        <th className="py-2.5 px-3 text-center">Attended</th>
                        <th className="py-2.5 px-3 text-center text-emerald-800">Admitted</th>
                        <th className="py-2.5 px-3 text-center text-rose-800">Dropped</th>
                        <th className="py-2.5 px-4 text-right">Conversion Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analyticsData.by_subject?.length > 0 ? (
                        analyticsData.by_subject.map((s, idx) => {
                          const rate = s.conversion_rate_percentage !== undefined ? s.conversion_rate_percentage : (s.conversion_rate || 0);
                          const admittedCount = s.converted_admissions !== undefined ? s.converted_admissions : (s.converted_demos || 0);
                          return (
                            <tr key={s.subject_id || idx} className="hover:bg-slate-50/70 transition">
                              <td className="py-3 px-4 font-bold text-black">
                                {s.subject_name}
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-black">
                                {s.total_demos}
                              </td>
                              <td className="py-3 px-3 text-center font-semibold text-odoo-700">
                                {s.active_demos}
                              </td>
                              <td className="py-3 px-3 text-center font-semibold text-amber-700">
                                {s.attended_demos || 0}
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-emerald-800 bg-emerald-50/40">
                                {admittedCount}
                              </td>
                              <td className="py-3 px-3 text-center font-semibold text-rose-700">
                                {s.dropped_demos}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="font-mono font-black text-xs text-black">
                                  {rate.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400">
                            No subject demo records for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
              No analytics data available.
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD ENQUIRY & MULTI-SUBJECT DEMO CART */}
      {/* ========================================================= */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Record New Student Enquiry & Demo Trial Pass"
        subtitle="Enrol candidate into one or multiple subject demo classes with individual tracking codes"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateEnquiry} className="space-y-4 text-xs">
          {/* Candidate Bio Information */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-black text-xs uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-odoo-600" />
              <span>Candidate Information</span>
            </h4>

            <Input
              label="Student Full Name"
              value={enquiryForm.student_name}
              onChange={(e) => setEnquiryForm({ ...enquiryForm, student_name: e.target.value })}
              placeholder="e.g. Priyanshu Sharma"
              required
              autoFocus
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Contact Mobile (Optional)"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                value={enquiryForm.mobile}
                onChange={(e) =>
                  setEnquiryForm({ ...enquiryForm, mobile: cleanMobileInput(e.target.value) })
                }
                placeholder="10-digit mobile"
                error={
                  enquiryForm.mobile && enquiryForm.mobile.length < 10
                    ? `Must be 10 digits (${enquiryForm.mobile.length}/10)`
                    : null
                }
                helperText={
                  enquiryForm.mobile && enquiryForm.mobile.length === 10
                    ? '✓ Valid 10-digit mobile'
                    : 'Optional 10-digit mobile'
                }
              />
              <Input
                label="Purpose / Target Class"
                value={enquiryForm.purpose}
                onChange={(e) => setEnquiryForm({ ...enquiryForm, purpose: e.target.value })}
                placeholder="e.g. JEE Preparation / Class 10 Foundation"
              />
            </div>
          </div>

          {/* Multi-Subject Demo Items Cart Builder */}
          <div className="bg-white p-3.5 rounded-xl border-2 border-purple-100 space-y-3">
            <div className="flex items-center justify-between border-b border-indigo-50 pb-2">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-odoo-600" />
                <h4 className="font-bold text-black text-xs uppercase tracking-wider">
                  Book Demo Trial Subjects (Cart Selection)
                </h4>
              </div>
              <span className="text-[10px] font-bold text-odoo-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                {demoCart.length} Subject(s) in Cart
              </span>
            </div>

            {/* Subject Cart Draft Inputs */}
            <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Select Trial Subject *
                  </label>
                  <select
                    value={cartDraft.subject_id}
                    onChange={(e) => handleCartSubjectChange(e.target.value)}
                    className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
                  >
                    <option value="">-- Choose Subject to Demo --</option>
                    {availableSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.subject_code || 'SUB'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Faculty / Teacher Assigned
                  </label>
                  <select
                    value={cartDraft.teacher_id}
                    onChange={(e) =>
                      setCartDraft((prev) => ({ ...prev, teacher_id: e.target.value }))
                    }
                    className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
                  >
                    <option value="">-- Select Teacher --</option>
                    {availableTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Classroom / Room
                  </label>
                  <input
                    type="text"
                    value={cartDraft.hall_number_snapshot}
                    onChange={(e) =>
                      setCartDraft((prev) => ({ ...prev, hall_number_snapshot: e.target.value }))
                    }
                    placeholder="e.g. Hall 1, Lab 2"
                    className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Demo Start Date
                  </label>
                  <input
                    type="date"
                    value={cartDraft.demo_start_date}
                    onChange={(e) =>
                      setCartDraft((prev) => ({ ...prev, demo_start_date: e.target.value }))
                    }
                    className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Duration (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={cartDraft.demo_duration_days}
                    onChange={(e) =>
                      setCartDraft((prev) => ({
                        ...prev,
                        demo_duration_days: parseInt(e.target.value, 10) || 1,
                      }))
                    }
                    className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  icon={Plus}
                  onClick={handleAddSubjectToCart}
                >
                  + Add Subject to Demo Cart
                </Button>
              </div>
            </div>

            {/* Selected Demo Subjects List */}
            {demoCart.length > 0 ? (
              <div className="space-y-1.5 border border-slate-200 rounded-lg p-2 bg-white">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Booked Trial Subjects (Each receives a unique Reference Code):
                </span>
                <div className="divide-y divide-slate-100">
                  {demoCart.map((item, index) => (
                    <div
                      key={item.tempId}
                      className="py-2 px-2 flex items-center justify-between text-xs hover:bg-slate-50 rounded"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-odoo-700 bg-purple-50 px-1.5 py-0.2 rounded text-[10px] border border-purple-200">
                            #{index + 1}
                          </span>
                          <span className="font-bold text-black">{item.subject_name_snapshot}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span>Faculty: <strong className="text-slate-700">{item.teacher_name_snapshot}</strong></span>
                          <span>•</span>
                          <span>Room: <strong className="text-slate-700">{item.hall_number_snapshot}</strong></span>
                          <span>•</span>
                          <span>Duration: <strong>{item.demo_duration_days} days</strong></span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveCartItem(item.tempId)}
                        className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                        title="Remove from cart"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3 text-center text-slate-500 text-xs">
                No subjects added to demo cart yet. Select a subject above and click "+ Add Subject to Demo Cart".
              </div>
            )}
          </div>

          <Input
            label="Counselor Follow-up Notes (Optional)"
            value={enquiryForm.notes}
            onChange={(e) => setEnquiryForm({ ...enquiryForm, notes: e.target.value })}
            placeholder="e.g. Student referred by school friend, interested in JEE morning batch"
          />

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={
                submitting ||
                (Boolean(enquiryForm.mobile) && enquiryForm.mobile.length !== 10)
              }
            >
              {enquiryForm.mobile && enquiryForm.mobile.length !== 10
                ? 'Enter 10-Digit Mobile'
                : `Generate Demo Slip (${demoCart.length > 0 ? demoCart.length : 1} Subject${demoCart.length > 1 ? 's' : ''})`}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: UPDATE INDIVIDUAL DEMO STATUS (Attended / Dropped) */}
      {/* ========================================================= */}
      <Modal
        isOpen={demoStatusModalOpen}
        onClose={() => setDemoStatusModalOpen(false)}
        title={`Update Demo Status: ${targetDemoStatus}`}
        subtitle={`Reference #${selectedDemoItem?.demo_reference_number} • ${selectedDemoItem?.student_name} (${selectedDemoItem?.subject_name_snapshot})`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveDemoStatus} className="space-y-3 text-xs">
          {targetDemoStatus === 'DROPPED' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select Reason for Dropping
              </label>
              <select
                value={demoDropReason}
                onChange={(e) => setDemoDropReason(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-rose-500"
              >
                <option value="Fee too high / Budget issue">Fee too high / Budget constraint</option>
                <option value="Timings / Batch schedule clash">Timings / Batch schedule clash</option>
                <option value="Distance / Transportation issue">Distance / Commute issue</option>
                <option value="Joined another coaching institute">Joined another institute / competitor</option>
                <option value="Decided on self-study / school only">Opted for self-study / school</option>
                <option value="Demo feedback / Teaching style mismatch">Demo feedback / Teaching style</option>
                <option value="Parent not convinced">Parent not convinced</option>
                <option value="Other / Personal reasons">Other / Personal reasons</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Follow-up Notes / Remarks (Optional)
            </label>
            <textarea
              rows={3}
              value={demoStatusNotes}
              onChange={(e) => setDemoStatusNotes(e.target.value)}
              placeholder="e.g. Student completed trial lectures and is pleased with faculty explanations..."
              className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black font-medium focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDemoStatusModalOpen(false)}
              disabled={updatingDemoStatus}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={targetDemoStatus === 'DROPPED' ? 'danger' : 'primary'}
              loading={updatingDemoStatus}
            >
              Confirm {targetDemoStatus}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: PRINTABLE DEMO TRIAL PASS */}
      {/* ========================================================= */}
      <DemoPassModal
        isOpen={Boolean(passModalEnquiry)}
        onClose={() => {
          setPassModalEnquiry(null);
          setPassModalDemoItem(null);
        }}
        enquiry={passModalEnquiry}
        demoItem={passModalDemoItem}
      />

      {/* ========================================================= */}
      {/* MODAL: ENQUIRY DETAIL VIEW */}
      {/* ========================================================= */}
      <EnquiryDetailModal
        isOpen={!!detailEnquiry}
        onClose={() => setDetailEnquiry(null)}
        enquiry={detailEnquiry}
        onConvertToAdmission={(e) => handleConvertToAdmission(e)}
      />

      {/* ========================================================= */}
      {/* MODAL: QUICK UPDATE COURSE / SUBJECT */}
      {/* ========================================================= */}
      <Modal
        isOpen={courseUpdateModalOpen}
        onClose={() => setCourseUpdateModalOpen(false)}
        title="Update Interested Course & Trial Schedule"
        subtitle={`Student: ${selectedCourseEnquiry?.student_name || ''} • ${selectedCourseEnquiry?.mobile || ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveCourseUpdate} className="space-y-3 text-xs">
          {availableSubjects.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select from Institute Subjects
              </label>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    setCourseFormData((prev) => ({
                      ...prev,
                      interested_subject: e.target.value,
                    }));
                  }
                }}
                defaultValue=""
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg text-black font-medium"
              >
                <option value="">-- Choose from subjects catalog --</option>
                {availableSubjects.map((sub) => (
                  <option key={sub.id} value={sub.name}>
                    {sub.name} ({sub.subject_code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <Input
            label="Interested Course / Subject Name"
            required
            value={courseFormData.interested_subject}
            onChange={(e) =>
              setCourseFormData({ ...courseFormData, interested_subject: e.target.value })
            }
            placeholder="e.g. Mathematics, Physics, Class 10 Foundation"
          />

          <Input
            label="Target Purpose / Class"
            value={courseFormData.purpose}
            onChange={(e) =>
              setCourseFormData({ ...courseFormData, purpose: e.target.value })
            }
            placeholder="e.g. Class 10 Board prep / JEE Foundation"
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Demo Start Date"
              type="date"
              value={courseFormData.demo_start_date}
              onChange={(e) =>
                setCourseFormData({ ...courseFormData, demo_start_date: e.target.value })
              }
            />
            <Input
              label="Duration (Days)"
              type="number"
              min="1"
              max="30"
              value={courseFormData.demo_duration_days}
              onChange={(e) =>
                setCourseFormData({ ...courseFormData, demo_duration_days: e.target.value })
              }
            />
          </div>

          <Select
            label="Enquiry Trial Status"
            value={courseFormData.status}
            onChange={(e) =>
              setCourseFormData({ ...courseFormData, status: e.target.value })
            }
            options={[
              { value: 'ACTIVE_DEMO', label: 'Active Demo (Attending trial)' },
              { value: 'INTERESTED', label: 'Interested in Admission (Post-Demo)' },
              { value: 'PENDING', label: 'Pending Demo (Walk-in only)' },
              { value: 'CONVERTED', label: 'Converted to Admission' },
              { value: 'EXPIRED', label: 'Expired / Lapsed Demo' },
              { value: 'NOT_INTERESTED', label: 'Not Interested (Dropped)' },
            ]}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Counselor Follow-up Notes
            </label>
            <textarea
              rows={2}
              value={courseFormData.notes}
              onChange={(e) =>
                setCourseFormData({ ...courseFormData, notes: e.target.value })
              }
              placeholder="e.g. Student requested to switch to Physics batch..."
              className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600 font-medium"
            />
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-slate-100">
            <Button
              type="button"
              variant="primary"
              size="xs"
              onClick={() => {
                setCourseUpdateModalOpen(false);
                handleConvertToAdmission(selectedCourseEnquiry);
              }}
              title="Proceed to register student and bill admission"
            >
              Admit Student ↗
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => setCourseUpdateModalOpen(false)}
                disabled={courseUpdating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="xs"
                loading={courseUpdating}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: NOT INTERESTED / DROP ENQUIRY */}
      {/* ========================================================= */}
      <Modal
        isOpen={notInterestedModalOpen}
        onClose={() => setNotInterestedModalOpen(false)}
        title="Mark Enquiry as Not Interested / Dropped"
        subtitle={`Student: ${targetNotInterestedEnquiry?.student_name || ''} • ${targetNotInterestedEnquiry?.interested_subject || ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleConfirmNotInterested} className="space-y-3 text-xs">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Primary Reason for Dropping
            </label>
            <select
              value={dropReason}
              onChange={(e) => setDropReason(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-rose-500"
            >
              <option value="Fee too high / Budget issue">Fee too high / Budget constraint</option>
              <option value="Timings / Batch schedule clash">Timings / Batch schedule clash</option>
              <option value="Distance / Transportation issue">Distance / Commute issue</option>
              <option value="Joined another coaching institute">Joined another institute / competitor</option>
              <option value="Decided on self-study / school only">Opted for self-study / school</option>
              <option value="Demo feedback / Teaching style mismatch">Demo feedback / Teaching style</option>
              <option value="Parent not convinced">Parent not convinced</option>
              <option value="Other / Personal reasons">Other / Personal reasons</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Additional Feedback / Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={customDropNotes}
              onChange={(e) => setCustomDropNotes(e.target.value)}
              placeholder="e.g. Student requested evening batch which is currently full, or parent asked for 50% discount..."
              className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-black focus:ring-1 focus:ring-rose-500 font-medium"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setNotInterestedModalOpen(false)}
              disabled={markingStatus}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={markingStatus}
            >
              Confirm Not Interested
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
