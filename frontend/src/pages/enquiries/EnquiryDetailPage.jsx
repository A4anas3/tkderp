import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Phone,
  BookOpen,
  Calendar,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  FileText,
  Edit2,
  ExternalLink,
  GraduationCap,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Printer,
  Hash,
  MapPin,
  User,
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import DemoPassModal from '../../components/modals/DemoPassModal';
import { enquiryApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { formatIndianDate } from '../../utils/dateCycleUtils';
import { cleanMobileInput } from '../../utils/phoneUtils';

export default function EnquiryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [enquiry, setEnquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [passModalOpen, setPassModalOpen] = useState(false);

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editFormData, setEditFormData] = useState({
    student_name: '',
    mobile: '',
    purpose: '',
    interested_subject: '',
    status: 'PENDING',
    demo_start_date: '',
    demo_deadline: '',
    notes: '',
  });

  // Not Interested Drop Modal State
  const [dropModalOpen, setDropModalOpen] = useState(false);
  const [dropReason, setDropReason] = useState('Fee too high / Budget issue');
  const [customDropNotes, setCustomDropNotes] = useState('');
  const [markingDrop, setMarkingDrop] = useState(false);

  const loadEnquiry = useCallback(async () => {
    setLoading(true);
    try {
      const data = await enquiryApi.get(id);
      setEnquiry(data);
      setEditFormData({
        student_name: data.student_name || '',
        mobile: data.mobile || '',
        purpose: data.purpose || '',
        interested_subject: data.interested_subject || '',
        status: data.status || 'PENDING',
        demo_start_date: data.demo_start_date || '',
        demo_deadline: data.demo_deadline || '',
        notes: data.notes || '',
      });
    } catch (err) {
      error(err.message || 'Failed to load enquiry details');
    } finally {
      setLoading(false);
    }
  }, [id, error]);

  useEffect(() => {
    loadEnquiry();
  }, [loadEnquiry]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (editFormData.mobile) {
      const clean = cleanMobileInput(editFormData.mobile);
      if (clean.length !== 10 || !/^\d{10}$/.test(clean)) {
        error('Mobile number must be exactly 10 numeric digits');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        ...editFormData,
        mobile: editFormData.mobile ? cleanMobileInput(editFormData.mobile) : null,
      };
      await enquiryApi.update(id, payload);
      success('Enquiry updated successfully');
      setEditModalOpen(false);
      loadEnquiry();
    } catch (err) {
      error(err.message || 'Failed to update enquiry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkInterested = async () => {
    try {
      const noteEntry = enquiry.notes
        ? `${enquiry.notes} • [Post-Demo: Student is Interested in Admission]`
        : '[Post-Demo: Student is Interested in Admission]';
      await enquiryApi.update(id, {
        status: 'INTERESTED',
        notes: noteEntry,
      });
      success(`${enquiry.student_name} marked as INTERESTED in joining!`);
      loadEnquiry();
    } catch (err) {
      error(err.message || 'Failed to update status');
    }
  };

  const handleConfirmDrop = async (e) => {
    e.preventDefault();
    setMarkingDrop(true);
    try {
      const noteSummary = customDropNotes?.trim()
        ? `[Not Interested: ${dropReason} - ${customDropNotes.trim()}]`
        : `[Not Interested: ${dropReason}]`;
      const combinedNotes = enquiry.notes
        ? `${enquiry.notes} • ${noteSummary}`
        : noteSummary;

      await enquiryApi.update(id, {
        status: 'NOT_INTERESTED',
        notes: combinedNotes,
      });
      success(`${enquiry.student_name} marked as Not Interested.`);
      setDropModalOpen(false);
      loadEnquiry();
    } catch (err) {
      error(err.message || 'Failed to update status');
    } finally {
      setMarkingDrop(false);
    }
  };

  const handleReactivate = async () => {
    try {
      await enquiryApi.update(id, {
        status: 'ACTIVE_DEMO',
        notes: enquiry.notes
          ? `${enquiry.notes} • [Re-activated demo classes]`
          : '[Re-activated demo classes]',
      });
      success(`Enquiry for ${enquiry.student_name} re-activated as Active Demo.`);
      loadEnquiry();
    } catch (err) {
      error(err.message || 'Failed to re-activate enquiry');
    }
  };

  const handleConvertToAdmission = () => {
    const params = new URLSearchParams({
      enquiry_id: enquiry.id,
      name: enquiry.student_name || '',
      mobile: enquiry.mobile || '',
      father_name: enquiry.father_name || '',
      school_college: enquiry.school_college || '',
      subject: enquiry.interested_subject || '',
      purpose: enquiry.purpose || '',
      auto_register: '1',
    });
    if (enquiry.converted_student_id) {
      params.set('student_id', enquiry.converted_student_id);
    }
    navigate(`/admissions/new?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
          <ArrowLeft className="w-4 h-4 animate-spin text-odoo-600" />
          <span>Loading enquiry details...</span>
        </div>
        <div className="bg-white rounded-xl p-8 border border-slate-200 animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/3"></div>
          <div className="h-12 bg-slate-100 rounded"></div>
          <div className="h-32 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (!enquiry) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/enquiries')}>
          Back to Enquiries
        </Button>
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
          <p className="text-sm font-semibold text-rose-700">Enquiry record not found.</p>
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const isConverted = enquiry.status === 'CONVERTED';
  const isInterested = enquiry.status === 'INTERESTED';
  const isActiveDemo = enquiry.status === 'ACTIVE_DEMO';
  const isPending = enquiry.status === 'PENDING';
  const isNotInterested = enquiry.status === 'NOT_INTERESTED';
  const isExpired = enquiry.status === 'EXPIRED' || (isActiveDemo && enquiry.demo_deadline && enquiry.demo_deadline < today);

  const statusVariant = isConverted
    ? 'success'
    : isInterested
    ? 'success'
    : isActiveDemo && !isExpired
    ? 'primary'
    : isPending
    ? 'warning'
    : isNotInterested
    ? 'neutral'
    : 'danger';

  // Days remaining calculation
  let daysRemainingText = null;
  if (isActiveDemo && enquiry.demo_deadline) {
    const deadlineDate = new Date(enquiry.demo_deadline);
    const todayDate = new Date(today);
    const diffDays = Math.ceil((deadlineDate - todayDate) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      daysRemainingText = `${diffDays} day(s) remaining in trial`;
    } else if (diffDays === 0) {
      daysRemainingText = 'Demo expires today!';
    } else {
      daysRemainingText = `Expired ${Math.abs(diffDays)} day(s) ago`;
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate('/enquiries')}
            className="p-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center"
            title="Back to Enquiries"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-black break-words leading-tight">
                Student Enquiry & Trial Class Details
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold border border-slate-200 shrink-0">
                {enquiry.id.slice(0, 8)}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
              Registered on {formatIndianDate(enquiry.enquiry_date)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="secondary"
            icon={Printer}
            onClick={() => setPassModalOpen(true)}
            size="sm"
            title="Print Official Trial Demo Pass / Slip"
          >
            Print Trial Pass
          </Button>

          <Button
            variant="secondary"
            icon={Edit2}
            onClick={() => setEditModalOpen(true)}
            size="sm"
          >
            Edit Enquiry
          </Button>

          {isNotInterested && (
            <Button
              variant="secondary"
              icon={RotateCcw}
              onClick={handleReactivate}
              size="sm"
              title="Re-open demo class"
            >
              Re-activate
            </Button>
          )}

          {!isConverted && !isInterested && !isNotInterested && (
            <Button
              variant="success"
              icon={ThumbsUp}
              onClick={handleMarkInterested}
              size="sm"
              title="Student completed demo and liked it"
            >
              Mark Interested
            </Button>
          )}

          {!isConverted && !isNotInterested && (
            <Button
              variant="secondary"
              icon={ThumbsDown}
              className="text-rose-700 hover:text-rose-800 hover:bg-rose-50 border-rose-200"
              onClick={() => {
                setDropReason('Fee too high / Budget issue');
                setCustomDropNotes('');
                setDropModalOpen(true);
              }}
              size="sm"
              title="Student is not interested"
            >
              Not Interested
            </Button>
          )}

          {enquiry.has_course_purchase ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/admissions/${enquiry.course_admission_id || ''}`)}
              className="text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 font-bold"
            >
              View Course Bill ({enquiry.course_admission_number || 'Enrolled ✓'}) ↗
            </Button>
          ) : enquiry.has_student_admission || isConverted ? (
            <Button
              variant="primary"
              icon={UserPlus}
              onClick={handleConvertToAdmission}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              Buy Course / Collect Fees ↗
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={UserPlus}
              onClick={handleConvertToAdmission}
              size="sm"
            >
              Convert to Admission ↗
            </Button>
          )}
        </div>
      </div>

      {/* Prominent Active vs Not Active Status Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
          enquiry.has_course_purchase
            ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
            : isConverted || enquiry.has_student_admission
            ? 'bg-blue-50 border-blue-300 text-blue-950'
            : isInterested
            ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
            : isActiveDemo && !isExpired
            ? 'bg-purple-50 border-odoo-300 text-odoo-900'
            : isPending
            ? 'bg-amber-50 border-amber-300 text-amber-950'
            : isNotInterested
            ? 'bg-slate-100 border-slate-300 text-slate-800'
            : 'bg-rose-50 border-rose-300 text-rose-950'
        }`}
      >
        <div className="flex items-center gap-3">
          {enquiry.has_course_purchase ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          ) : isConverted || enquiry.has_student_admission ? (
            <CheckCircle2 className="w-6 h-6 text-blue-600 shrink-0" />
          ) : isInterested ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          ) : isActiveDemo && !isExpired ? (
            <Clock className="w-6 h-6 text-odoo-600 shrink-0" />
          ) : isPending ? (
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
          ) : isNotInterested ? (
            <AlertCircle className="w-6 h-6 text-slate-500 shrink-0" />
          ) : (
            <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
          )}
          <div>
            <div className="text-xs font-black uppercase tracking-wider">
              Enquiry Status:{' '}
              {enquiry.has_course_purchase
                ? `COURSE ENROLLED & PAID (${enquiry.course_admission_number || 'ADMISSION COMPLETED'})`
                : isConverted || enquiry.has_student_admission
                ? `STUDENT ADMITTED (NO COURSE PURCHASED YET) ${enquiry.converted_student_code ? `• ${enquiry.converted_student_code}` : ''}`
                : isInterested
                ? '👍 INTERESTED IN ADMISSION (POST-DEMO)'
                : isActiveDemo && !isExpired
                ? 'ACTIVE TRIAL DEMO'
                : isPending
                ? 'PENDING DEMO (ENQUIRY ONLY)'
                : isNotInterested
                ? 'NOT INTERESTED / DROPPED POST-DEMO'
                : 'EXPIRED / LAPSED DEMO'}
            </div>
            <div className="text-xs text-slate-700 font-medium mt-0.5">
              {enquiry.has_course_purchase
                ? `Student has purchased courses/batches and is actively enrolled. Admission #${enquiry.course_admission_number || ''}`
                : isConverted || enquiry.has_student_admission
                ? 'Student admission profile is created in system, but NO course or batch has been purchased yet.'
                : isInterested
                ? 'Student completed trial classes and confirmed interest in admission. Ready for formal enrollment!'
                : isActiveDemo && !isExpired
                ? `Student is currently attending trial demo classes. ${daysRemainingText || ''}`
                : isPending
                ? 'Initial enquiry recorded. Demo class has not yet started.'
                : isNotInterested
                ? 'Student decided not to enroll after enquiry/trial. Feedback recorded in counselor notes below.'
                : 'The trial class demo window has lapsed without student enrollment.'}
            </div>
          </div>
        </div>
        <Badge
          variant={
            enquiry.has_course_purchase
              ? 'success'
              : isConverted || enquiry.has_student_admission
              ? 'info'
              : statusVariant
          }
          size="md"
          className="uppercase font-bold tracking-wider self-start sm:self-auto"
        >
          {enquiry.has_course_purchase
            ? 'COURSE PAID ✓'
            : isConverted || enquiry.has_student_admission
            ? 'ADMITTED (NO COURSE)'
            : isInterested
            ? '👍 INTERESTED'
            : enquiry.status.replace('_', ' ')}
        </Badge>
      </div>

      {/* Student Details Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center gap-3.5 border-b border-slate-100 pb-3">
          <div className="w-12 h-12 rounded-full bg-purple-100 text-odoo-700 font-black flex items-center justify-center text-base border border-purple-200 shrink-0">
            {enquiry.student_name ? enquiry.student_name.slice(0, 2).toUpperCase() : 'EN'}
          </div>
          <div>
            <h2 className="font-bold text-black text-lg">
              {enquiry.student_name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-0.5">
              <span className="font-mono font-semibold">📞 {enquiry.mobile}</span>
              {enquiry.father_name && (
                <>
                  <span>•</span>
                  <span>Father: {enquiry.father_name}</span>
                </>
              )}
              {enquiry.school_college && (
                <>
                  <span>•</span>
                  <span>School: {enquiry.school_college}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 block font-medium">Interested Subject / Domain</span>
              <button
                onClick={() => setEditModalOpen(true)}
                className="text-[10px] font-bold text-odoo-700 hover:text-odoo-900 bg-purple-50 hover:bg-purple-100 px-1.5 py-0.5 rounded border border-purple-200 inline-flex items-center gap-0.5 cursor-pointer"
              >
                <Edit2 className="w-2.5 h-2.5" />
                <span>Change</span>
              </button>
            </div>
            <span className="font-bold text-black text-sm mt-0.5 block">
              {enquiry.interested_subject || 'All Academic Subjects'}
            </span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 block font-medium">Enquiry Purpose / Batch</span>
            <span className="font-bold text-black text-sm">
              {enquiry.purpose || 'Coaching Admission'}
            </span>
          </div>
        </div>
      </div>

      {/* Subject Demos with Individual Reference Numbers */}
      {enquiry.demo_items && enquiry.demo_items.length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-black text-sm flex items-center gap-2">
              <Hash className="w-4 h-4 text-odoo-600" />
              <span>Subject Demos & Tracking Codes ({enquiry.demo_items.length})</span>
            </h3>
            <Button
              size="xs"
              variant="secondary"
              icon={Printer}
              onClick={() => setPassModalOpen(true)}
            >
              Print Demo Slip
            </Button>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {enquiry.demo_items.map((item) => (
              <div
                key={item.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-odoo-900">
                      {item.demo_reference_number}
                    </span>
                    <h4 className="font-bold text-black text-sm">
                      {item.subject_name_snapshot || 'Subject Trial'}
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>Faculty: <strong className="text-black">{item.teacher_name_snapshot || 'Assigned Faculty'}</strong></span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>Room: <strong className="text-black">{item.hall_number_snapshot || 'Main Hall'}</strong></span>
                    </span>
                  </div>
                </div>

                <div className="sm:text-right shrink-0">
                  <span className="font-mono text-xs font-bold text-black block">
                    {formatIndianDate(item.demo_start_date)}
                    {item.demo_end_date && ` → ${formatIndianDate(item.demo_end_date)}`}
                  </span>
                  <div className="flex items-center sm:justify-end gap-1.5 mt-1">
                    <span className="text-[11px] text-slate-500 font-medium">
                      Duration: {item.demo_duration_days || 3} Days
                    </span>
                    <Badge
                      size="xs"
                      variant={
                        item.status === 'CONVERTED'
                          ? 'success'
                          : item.status === 'ATTENDED'
                          ? 'warning'
                          : item.status === 'ACTIVE'
                          ? 'primary'
                          : 'neutral'
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trial Demo Dates Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <h3 className="font-bold text-black text-sm flex items-center gap-2">
          <Calendar className="w-4 h-4 text-odoo-600" />
          <span>Trial Demo Schedule & Deadlines</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 block font-medium">Walk-in Enquiry Date</span>
            <span className="font-mono font-bold text-black text-sm">
              {formatIndianDate(enquiry.enquiry_date)}
            </span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 block font-medium">Demo Start Date</span>
            <span className="font-mono font-bold text-black text-sm">
              {enquiry.demo_start_date ? formatIndianDate(enquiry.demo_start_date) : 'Not Started'}
            </span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 block font-medium">Demo Trial Deadline</span>
            <span className="font-mono font-bold text-odoo-700 text-sm">
              {enquiry.demo_deadline ? formatIndianDate(enquiry.demo_deadline) : 'No Deadline'}
            </span>
            {daysRemainingText && (
              <div className="text-[10px] font-bold text-odoo-600 mt-0.5">
                {daysRemainingText}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Counselor Notes */}
      {enquiry.notes && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs text-xs space-y-1.5">
          <h3 className="font-bold text-black flex items-center gap-1.5 uppercase tracking-wider text-xs">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Staff / Counselor Follow-up Notes</span>
          </h3>
          <p className="text-slate-800 font-medium whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-200">
            {enquiry.notes}
          </p>
        </div>
      )}

      {/* Edit Enquiry Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Student Enquiry Details"
        subtitle={`Enquiry ID: ${enquiry.id.slice(0, 8)}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleUpdate} className="space-y-3 text-xs">
          <Input
            label="Student Name"
            required
            value={editFormData.student_name}
            onChange={(e) => setEditFormData({ ...editFormData, student_name: e.target.value })}
          />

          <Input
            label="Mobile Number (Optional)"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={10}
            value={editFormData.mobile}
            onChange={(e) => setEditFormData({ ...editFormData, mobile: cleanMobileInput(e.target.value) })}
            placeholder="10-digit mobile"
            error={
              editFormData.mobile && editFormData.mobile.length < 10
                ? `Must be 10 digits (${editFormData.mobile.length}/10)`
                : null
            }
            helperText={
              editFormData.mobile && editFormData.mobile.length === 10
                ? '✓ Valid 10-digit mobile'
                : 'Optional 10-digit mobile'
            }
          />

          <Select
            label="Enquiry Status"
            value={editFormData.status}
            onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
            options={[
              { value: 'PENDING', label: 'Pending Demo (Walk-in)' },
              { value: 'ACTIVE_DEMO', label: 'Active Trial Demo' },
              { value: 'INTERESTED', label: 'Interested in Admission (Post-Demo)' },
              { value: 'CONVERTED', label: 'Converted to Admission' },
              { value: 'EXPIRED', label: 'Expired / Lapsed' },
              { value: 'NOT_INTERESTED', label: 'Not Interested (Dropped)' },
            ]}
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Demo Start Date"
              type="date"
              value={editFormData.demo_start_date}
              onChange={(e) => setEditFormData({ ...editFormData, demo_start_date: e.target.value })}
            />
            <Input
              label="Demo Deadline"
              type="date"
              value={editFormData.demo_deadline}
              onChange={(e) => setEditFormData({ ...editFormData, demo_deadline: e.target.value })}
            />
          </div>

          <Input
            label="Interested Subject"
            value={editFormData.interested_subject}
            onChange={(e) => setEditFormData({ ...editFormData, interested_subject: e.target.value })}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Counselor Notes
            </label>
            <textarea
              rows={3}
              value={editFormData.notes}
              onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
              className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-black focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600 font-medium"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setEditModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={submitting || (Boolean(editFormData.mobile) && editFormData.mobile.length !== 10)}
            >
              {editFormData.mobile && editFormData.mobile.length !== 10 ? 'Enter 10-Digit Mobile' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Drop / Not Interested Modal */}
      <Modal
        isOpen={dropModalOpen}
        onClose={() => setDropModalOpen(false)}
        title="Mark Enquiry as Not Interested / Dropped"
        subtitle={`Student: ${enquiry?.student_name || ''} • ${enquiry?.interested_subject || ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleConfirmDrop} className="space-y-3 text-xs">
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
              <option value="Demo feedback / Teaching style mismatch">Demo feedback / Teaching style mismatch</option>
              <option value="Parent not convinced">Parent not convinced</option>
              <option value="Other / Personal reasons">Other / Personal reasons</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Additional Feedback / Counselor Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={customDropNotes}
              onChange={(e) => setCustomDropNotes(e.target.value)}
              placeholder="e.g. Student found timing conflicting with school lab classes..."
              className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-black focus:ring-1 focus:ring-rose-500 font-medium"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDropModalOpen(false)}
              disabled={markingDrop}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={markingDrop}
            >
              Confirm Not Interested
            </Button>
          </div>
        </form>
      </Modal>
      {/* Demo Pass Modal */}
      <DemoPassModal
        isOpen={passModalOpen}
        onClose={() => setPassModalOpen(false)}
        enquiry={enquiry}
      />
    </div>
  );
}
