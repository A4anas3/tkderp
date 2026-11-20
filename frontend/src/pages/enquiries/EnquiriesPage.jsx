import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import EnquiryDetailModal from '../../components/modals/EnquiryDetailModal';
import { enquiryApi, subjectApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function EnquiriesPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const [enquiries, setEnquiries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Summary counts for professional ERP pipeline overview
  const [summary, setSummary] = useState({
    total: 0,
    ACTIVE_DEMO: 0,
    INTERESTED: 0,
    PENDING: 0,
    CONVERTED: 0,
    EXPIRED: 0,
    NOT_INTERESTED: 0,
  });

  // Action Menu dropdown state (to limit buttons in table rows)
  const [activeActionMenuId, setActiveActionMenuId] = useState(null);

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

  // Deadlines widget data
  const [deadlines, setDeadlines] = useState([]);
  const [deadlinesLoading, setDeadlinesLoading] = useState(true);

  // Add Enquiry Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [detailEnquiry, setDetailEnquiry] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Available subjects for dropdown
  const [availableSubjects, setAvailableSubjects] = useState([]);

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
  const [formData, setFormData] = useState({
    student_name: '',
    mobile: '',
    purpose: 'Class 9-10 Coaching Trial',
    interested_subject: 'Mathematics & Science',
    demo_start_date: new Date().toISOString().split('T')[0],
    demo_duration_days: 3,
    status: 'ACTIVE_DEMO',
    notes: '',
  });

  const loadSummary = useCallback(async () => {
    try {
      const s = await enquiryApi.getSummary();
      if (s) setSummary(s);
    } catch (err) {
      console.warn('Failed to load enquiry summary:', err);
    }
  }, []);

  const loadEnquiries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await enquiryApi.list({
        page,
        page_size: 15,
        search: search.trim() || undefined,
        status_filter: statusFilter || undefined,
        status: statusFilter || undefined,
      });
      setEnquiries(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load enquiries');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, error]);

  const loadDeadlines = async () => {
    setDeadlinesLoading(true);
    try {
      const res = await enquiryApi.getUpcomingDeadlines();
      setDeadlines(res || []);
    } catch (err) {
      console.error('Failed to load upcoming demo deadlines:', err);
    } finally {
      setDeadlinesLoading(false);
    }
  };

  useEffect(() => {
    loadEnquiries();
  }, [loadEnquiries]);

  useEffect(() => {
    loadDeadlines();
    loadSummary();
    subjectApi
      .getAll()
      .then((subs) => setAvailableSubjects(subs || []))
      .catch(console.warn);
  }, [loadSummary]);

  const handleCreateEnquiry = async (e) => {
    e.preventDefault();
    if (!formData.student_name.trim()) {
      error('Student name is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        student_name: formData.student_name.trim(),
        mobile: formData.mobile.trim() || null,
        purpose: formData.purpose.trim() || null,
        interested_subject: formData.interested_subject.trim() || null,
        demo_start_date: formData.demo_start_date || null,
        demo_duration_days: parseInt(formData.demo_duration_days, 10) || 0,
        status: formData.status,
        notes: formData.notes.trim() || null,
      };

      const res = await enquiryApi.create(payload);
      success(`Enquiry registered for ${res.student_name}`);
      setAddModalOpen(false);
      setFormData({
        student_name: '',
        mobile: '',
        purpose: 'Class 9-10 Coaching Trial',
        interested_subject: 'Mathematics & Science',
        demo_start_date: new Date().toISOString().split('T')[0],
        demo_duration_days: 3,
        status: 'ACTIVE_DEMO',
        notes: '',
      });
      loadEnquiries();
      loadDeadlines();
      loadSummary();
    } catch (err) {
      error(err.message || 'Failed to create enquiry');
    } finally {
      setSubmitting(false);
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

  const handleConvertToAdmission = (enq, ev) => {
    if (ev) ev.stopPropagation();
    navigate(
      `/admissions/new?enquiry_id=${enq.id}&name=${encodeURIComponent(
        enq.student_name
      )}&mobile=${encodeURIComponent(enq.mobile || '')}&subject=${encodeURIComponent(
        enq.interested_subject || ''
      )}&purpose=${encodeURIComponent(enq.purpose || '')}&auto_register=1`
    );
  };

  // Modal for Not Interested / Drop Reason
  const [notInterestedModalOpen, setNotInterestedModalOpen] = useState(false);
  const [targetNotInterestedEnquiry, setTargetNotInterestedEnquiry] = useState(null);
  const [dropReason, setDropReason] = useState('Fee too high / Budget issue');
  const [customDropNotes, setCustomDropNotes] = useState('');
  const [markingStatus, setMarkingStatus] = useState(false);

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

  const columns = [
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
      header: 'Interested Course / Subject',
      className: 'text-xs font-medium text-slate-800',
      render: (e) => (
        <div className="flex items-center justify-between gap-1 group">
          <div>
            <div className="font-bold text-black flex items-center gap-1.5">
              <span>{e.interested_subject}</span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">{e.purpose || 'Coaching Trial'}</div>
          </div>
          <button
            onClick={(ev) => handleOpenCourseUpdate(e, ev)}
            title="Change / Update Interested Subject & Trial Details"
            className="p-1 rounded text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition cursor-pointer shrink-0"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
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
      className: 'text-center w-32',
      render: (e) => {
        const variants = {
          ACTIVE_DEMO: 'primary',
          INTERESTED: 'success',
          PENDING: 'warning',
          CONVERTED: 'success',
          EXPIRED: 'danger',
          NOT_INTERESTED: 'neutral',
        };
        const labels = {
          ACTIVE_DEMO: 'Active Demo',
          INTERESTED: '👍 Interested',
          PENDING: 'Pending',
          CONVERTED: 'Converted',
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
      className: 'text-right w-44',
      render: (e) => {
        const isConverted = e.status === 'CONVERTED';
        const isMenuOpen = activeActionMenuId === e.id;

        return (
          <div className="flex items-center justify-end gap-1.5 relative">
            {isConverted ? (
              <>
                <Badge size="xs" variant="success">
                  Enrolled ✓
                </Badge>
                <Button
                  size="xs"
                  variant="secondary"
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
                  Admit ↗
                </Button>

                {/* Clean compact options menu (limits buttons on table rows) */}
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
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
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
                      className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-30 text-xs divide-y divide-slate-100"
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
                          handleOpenCourseUpdate(e, ev);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-indigo-500" />
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
                          className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 flex items-center gap-2 text-indigo-700 font-medium cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
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

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">
            Enquiries & Trial Demo Classes
          </h1>
          <p className="text-xs text-slate-500">
            Track student walk-ins, free demo periods, post-demo interest, and convert to admission
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={() => setAddModalOpen(true)}>
          New Enquiry
        </Button>
      </div>

      {/* Professional ERP Pipeline Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <div
          onClick={() => {
            setStatusFilter('');
            setPage(1);
          }}
          className={`p-2.5 rounded-lg border transition cursor-pointer ${
            statusFilter === ''
              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === '' ? 'text-slate-300' : 'text-slate-500'}`}>
              Total Leads
            </span>
            <Users className={`w-3.5 h-3.5 ${statusFilter === '' ? 'text-white' : 'text-slate-400'}`} />
          </div>
          <div className={`text-lg font-black mt-0.5 ${statusFilter === '' ? 'text-white' : 'text-black'}`}>
            {summary.total}
          </div>
        </div>

        <div
          onClick={() => {
            setStatusFilter('ACTIVE_DEMO');
            setPage(1);
          }}
          className={`p-2.5 rounded-lg border transition cursor-pointer ${
            statusFilter === 'ACTIVE_DEMO'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-white border-slate-200 hover:border-indigo-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'ACTIVE_DEMO' ? 'text-indigo-100' : 'text-indigo-700'}`}>
              Active Demos
            </span>
            <Clock className={`w-3.5 h-3.5 ${statusFilter === 'ACTIVE_DEMO' ? 'text-white' : 'text-indigo-500'}`} />
          </div>
          <div className={`text-lg font-black mt-0.5 ${statusFilter === 'ACTIVE_DEMO' ? 'text-white' : 'text-indigo-900'}`}>
            {summary.ACTIVE_DEMO}
          </div>
        </div>

        <div
          onClick={() => {
            setStatusFilter('INTERESTED');
            setPage(1);
          }}
          className={`p-2.5 rounded-lg border transition cursor-pointer ${
            statusFilter === 'INTERESTED'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
              : 'bg-white border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'INTERESTED' ? 'text-emerald-100' : 'text-emerald-700'}`}>
              Interested
            </span>
            <ThumbsUp className={`w-3.5 h-3.5 ${statusFilter === 'INTERESTED' ? 'text-white' : 'text-emerald-500'}`} />
          </div>
          <div className={`text-lg font-black mt-0.5 ${statusFilter === 'INTERESTED' ? 'text-white' : 'text-emerald-900'}`}>
            {summary.INTERESTED}
          </div>
        </div>

        <div
          onClick={() => {
            setStatusFilter('PENDING');
            setPage(1);
          }}
          className={`p-2.5 rounded-lg border transition cursor-pointer ${
            statusFilter === 'PENDING'
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'PENDING' ? 'text-amber-100' : 'text-amber-700'}`}>
              Pending Demo
            </span>
            <Calendar className={`w-3.5 h-3.5 ${statusFilter === 'PENDING' ? 'text-white' : 'text-amber-500'}`} />
          </div>
          <div className={`text-lg font-black mt-0.5 ${statusFilter === 'PENDING' ? 'text-white' : 'text-amber-900'}`}>
            {summary.PENDING}
          </div>
        </div>

        <div
          onClick={() => {
            setStatusFilter('CONVERTED');
            setPage(1);
          }}
          className={`p-2.5 rounded-lg border transition cursor-pointer ${
            statusFilter === 'CONVERTED'
              ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
              : 'bg-white border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'CONVERTED' ? 'text-emerald-100' : 'text-emerald-800'}`}>
              Admitted
            </span>
            <CheckCircle2 className={`w-3.5 h-3.5 ${statusFilter === 'CONVERTED' ? 'text-white' : 'text-emerald-600'}`} />
          </div>
          <div className={`text-lg font-black mt-0.5 ${statusFilter === 'CONVERTED' ? 'text-white' : 'text-emerald-950'}`}>
            {summary.CONVERTED}
          </div>
        </div>

        <div
          onClick={() => {
            setStatusFilter('NOT_INTERESTED');
            setPage(1);
          }}
          className={`p-2.5 rounded-lg border transition cursor-pointer ${
            statusFilter === 'NOT_INTERESTED'
              ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'NOT_INTERESTED' ? 'text-slate-200' : 'text-slate-600'}`}>
              Dropped / Other
            </span>
            <XCircle className={`w-3.5 h-3.5 ${statusFilter === 'NOT_INTERESTED' ? 'text-white' : 'text-slate-400'}`} />
          </div>
          <div className={`text-lg font-black mt-0.5 ${statusFilter === 'NOT_INTERESTED' ? 'text-white' : 'text-slate-700'}`}>
            {summary.NOT_INTERESTED + summary.EXPIRED}
          </div>
        </div>
      </div>

      {/* Upcoming Demo Deadlines Section */}
      {deadlines.length > 0 ? (
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
                        className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 inline-flex items-center gap-0.5 cursor-pointer ml-1"
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
                      {!isInterested && (
                        <Button
                          size="xs"
                          variant="success"
                          onClick={(ev) => handleMarkInterested(d, ev)}
                          title="Student completed demo and liked it"
                        >
                          👍 Interested
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="secondary"
                        className="text-rose-700 hover:text-rose-800 hover:bg-rose-50 border-rose-200"
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
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-medium text-slate-700">
              All demo trial classes are currently active and on schedule — 0 urgent expiration deadlines.
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Pipeline Healthy</span>
        </div>
      )}

      {/* Status Filter Tabs with Counts (Never mixes admitted ones into active demo) */}
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
          const isActive = statusFilter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
              className={`px-3 py-1 text-xs rounded-full border transition font-medium flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  isActive
                    ? 'bg-indigo-500 text-white'
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
        columns={columns}
        data={enquiries}
        total={total}
        page={page}
        pageSize={15}
        onPageChange={(p) => setPage(p)}
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        onRefresh={loadEnquiries}
        loading={loading}
        onRowClick={(e) => navigate(`/enquiries/${e.id}`)}
        searchPlaceholder="Search enquiry by student name or mobile..."
        emptyMessage="No enquiry records found for this filter."
      />

      {/* Add Enquiry Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Record New Student Enquiry / Demo"
        subtitle="A student can enquire and take trial classes before becoming a registered student"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateEnquiry} className="space-y-3">
          <Input
            label="Student Full Name"
            value={formData.student_name}
            onChange={(e) => setFormData({ ...formData, student_name: e.target.value })}
            placeholder="e.g. Priyanshu Sharma"
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Contact Mobile (Optional)"
              type="tel"
              value={formData.mobile}
              onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
              placeholder="10-digit mobile"
            />
            <Input
              label="Interested Subject / Class"
              value={formData.interested_subject}
              onChange={(e) => setFormData({ ...formData, interested_subject: e.target.value })}
              placeholder="e.g. Physics, Chemistry"
            />
          </div>

          <Input
            label="Purpose of Enquiry"
            value={formData.purpose}
            onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
            placeholder="e.g. JEE Preparation / Class 10 Board"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Demo Start Date"
              type="date"
              value={formData.demo_start_date}
              onChange={(e) => setFormData({ ...formData, demo_start_date: e.target.value })}
            />
            <Input
              label="Demo Duration (Days)"
              type="number"
              min="1"
              max="30"
              value={formData.demo_duration_days}
              onChange={(e) => setFormData({ ...formData, demo_duration_days: e.target.value })}
            />
          </div>

          <Select
            label="Initial Status"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            options={[
              { value: 'ACTIVE_DEMO', label: 'Active Demo (Attending trial classes)' },
              { value: 'INTERESTED', label: 'Interested in Admission (Post-Demo)' },
              { value: 'PENDING', label: 'Pending (Enquiry taken, demo not started)' },
              { value: 'NOT_INTERESTED', label: 'Not Interested' },
            ]}
          />

          <Input
            label="Additional Notes (Optional)"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="e.g. Referred by Manish"
          />

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setAddModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Record Enquiry
            </Button>
          </div>
        </form>
      </Modal>

      {/* Enquiry Detail Modal */}
      <EnquiryDetailModal
        isOpen={!!detailEnquiry}
        onClose={() => setDetailEnquiry(null)}
        enquiry={detailEnquiry}
        onConvertToAdmission={(e) => handleConvertToAdmission(e)}
      />

      {/* Quick Change / Update Interested Course Modal */}
      <Modal
        isOpen={courseUpdateModalOpen}
        onClose={() => setCourseUpdateModalOpen(false)}
        title="Update Interested Course & Trial Schedule"
        subtitle={`Student: ${selectedCourseEnquiry?.student_name || ''} • ${selectedCourseEnquiry?.mobile || ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveCourseUpdate} className="space-y-3 text-xs">
          {/* Quick select helper from institute catalog */}
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
              className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black focus:ring-1 focus:ring-indigo-500 font-medium"
            />
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
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

      {/* Drop / Not Interested Modal */}
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
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-black font-medium focus:ring-1 focus:ring-rose-500"
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
