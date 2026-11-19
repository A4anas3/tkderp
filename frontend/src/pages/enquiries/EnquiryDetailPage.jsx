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
  GraduationCap
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import { enquiryApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { formatIndianDate } from '../../utils/dateCycleUtils';

export default function EnquiryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [enquiry, setEnquiry] = useState(null);
  const [loading, setLoading] = useState(true);

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
    setSubmitting(true);
    try {
      await enquiryApi.update(id, editFormData);
      success('Enquiry updated successfully');
      setEditModalOpen(false);
      loadEnquiry();
    } catch (err) {
      error(err.message || 'Failed to update enquiry');
    } finally {
      setSubmitting(false);
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
    navigate(`/admissions/new?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
          <ArrowLeft className="w-4 h-4 animate-spin text-indigo-600" />
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
  const isActiveDemo = enquiry.status === 'ACTIVE_DEMO';
  const isPending = enquiry.status === 'PENDING';
  const isExpired = enquiry.status === 'EXPIRED' || (isActiveDemo && enquiry.demo_deadline && enquiry.demo_deadline < today);

  const statusVariant = isConverted
    ? 'success'
    : isActiveDemo && !isExpired
    ? 'primary'
    : isPending
    ? 'warning'
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
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/enquiries')}
            className="p-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer"
            title="Back to Enquiries"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-black">
                Student Enquiry & Trial Class Details
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold border border-slate-200">
                {enquiry.id.slice(0, 8)}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono">
              Registered on {formatIndianDate(enquiry.enquiry_date)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={Edit2}
            onClick={() => setEditModalOpen(true)}
            size="sm"
          >
            Edit Enquiry
          </Button>

          {!isConverted && (
            <Button
              variant="primary"
              icon={UserPlus}
              onClick={handleConvertToAdmission}
              size="sm"
            >
              Convert to Admission
            </Button>
          )}
        </div>
      </div>

      {/* Prominent Active vs Not Active Status Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
          isConverted
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : isActiveDemo && !isExpired
            ? 'bg-indigo-50 border-indigo-300 text-indigo-950'
            : isPending
            ? 'bg-amber-50 border-amber-300 text-amber-950'
            : 'bg-rose-50 border-rose-300 text-rose-950'
        }`}
      >
        <div className="flex items-center gap-3">
          {isConverted ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          ) : isActiveDemo && !isExpired ? (
            <Clock className="w-6 h-6 text-indigo-600 shrink-0" />
          ) : isPending ? (
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
          ) : (
            <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
          )}
          <div>
            <div className="text-xs font-black uppercase tracking-wider">
              Enquiry Status:{' '}
              {isConverted
                ? 'CONVERTED (REGISTERED STUDENT)'
                : isActiveDemo && !isExpired
                ? 'ACTIVE TRIAL DEMO'
                : isPending
                ? 'PENDING DEMO (ENQUIRY ONLY)'
                : 'EXPIRED / NOT ACTIVE'}
            </div>
            <div className="text-xs text-slate-700 font-medium mt-0.5">
              {isConverted
                ? 'Student successfully converted and registered into coaching cohorts'
                : isActiveDemo && !isExpired
                ? `Student is currently attending trial demo classes. ${daysRemainingText || ''}`
                : isPending
                ? 'Initial enquiry recorded. Demo class has not yet started.'
                : 'The trial class demo window has lapsed without student enrollment.'}
            </div>
          </div>
        </div>
        <Badge
          variant={statusVariant}
          size="md"
          className="uppercase font-bold tracking-wider self-start sm:self-auto"
        >
          {enquiry.status}
        </Badge>
      </div>

      {/* Student Details Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center gap-3.5 border-b border-slate-100 pb-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-base border border-indigo-200 shrink-0">
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
                className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 inline-flex items-center gap-0.5 cursor-pointer"
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

      {/* Trial Demo Dates Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <h3 className="font-bold text-black text-sm flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-600" />
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
            <span className="font-mono font-bold text-indigo-700 text-sm">
              {enquiry.demo_deadline ? formatIndianDate(enquiry.demo_deadline) : 'No Deadline'}
            </span>
            {daysRemainingText && (
              <div className="text-[10px] font-bold text-indigo-600 mt-0.5">
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
            label="Mobile Number"
            required
            value={editFormData.mobile}
            onChange={(e) => setEditFormData({ ...editFormData, mobile: e.target.value })}
          />

          <Select
            label="Enquiry Status"
            value={editFormData.status}
            onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
            options={[
              { value: 'PENDING', label: 'Pending Demo (Walk-in)' },
              { value: 'ACTIVE_DEMO', label: 'Active Trial Demo' },
              { value: 'CONVERTED', label: 'Converted to Admission' },
              { value: 'EXPIRED', label: 'Expired / Lapsed' },
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
              className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-black focus:ring-1 focus:ring-indigo-500 font-medium"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setEditModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
