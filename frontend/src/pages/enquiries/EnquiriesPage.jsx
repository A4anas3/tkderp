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

  const loadEnquiries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await enquiryApi.list({
        page,
        page_size: 15,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
      });
      setEnquiries(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load enquiries');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

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
    subjectApi
      .getAll()
      .then((subs) => setAvailableSubjects(subs || []))
      .catch(console.warn);
  }, []);

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
      className: 'text-right min-w-[200px]',
      render: (e) => (
        <div className="flex items-center justify-end gap-1 flex-wrap">
          <Button
            size="xs"
            variant="secondary"
            icon={ExternalLink}
            onClick={() => navigate(`/enquiries/${e.id}`)}
            title="Open Dedicated Enquiry Page"
          >
            Detail ↗
          </Button>

          {e.status === 'ACTIVE_DEMO' && (
            <>
              <Button
                size="xs"
                variant="success"
                onClick={(ev) => handleMarkInterested(e, ev)}
                title="Mark student as interested in admission"
              >
                👍 Interested
              </Button>
              <Button
                size="xs"
                variant="secondary"
                className="text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                onClick={(ev) => handleOpenNotInterestedModal(e, ev)}
                title="Mark as not interested / drop"
              >
                👎 Drop
              </Button>
            </>
          )}

          {e.status === 'INTERESTED' && (
            <Button
              size="xs"
              variant="secondary"
              className="text-rose-600 hover:text-rose-800 hover:bg-rose-50"
              onClick={(ev) => handleOpenNotInterestedModal(e, ev)}
              title="Change to Not Interested / Drop"
            >
              👎 Drop
            </Button>
          )}

          {e.status === 'NOT_INTERESTED' && (
            <Button
              size="xs"
              variant="secondary"
              onClick={(ev) => handleMarkInterested(e, ev)}
              title="Re-activate enquiry as Interested"
            >
              Re-activate
            </Button>
          )}

          {e.status !== 'CONVERTED' ? (
            <Button
              size="xs"
              variant="primary"
              onClick={() => handleConvertToAdmission(e)}
            >
              Admit
            </Button>
          ) : (
            <Badge size="xs" variant="success">
              Enrolled
            </Badge>
          )}
        </div>
      ),
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

      {/* Dedicated Upcoming Demo Deadlines Section */}
      <div className="bg-white border border-amber-300 rounded-lg p-3 sm:p-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-amber-100 pb-2 mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-black">
              Upcoming Demo Deadlines — Trial Classes Expiring Soon
            </h2>
          </div>
          <span className="text-[11px] text-amber-900 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            {deadlines.length} Demos Requiring Action
          </span>
        </div>

        {deadlinesLoading ? (
          <div className="py-4 text-center text-xs text-slate-500">Loading demo deadlines...</div>
        ) : deadlines.length === 0 ? (
          <div className="py-3 text-center text-xs text-slate-500">
            No active demo deadlines right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {deadlines.map((d) => {
              const isOverdue = d.demo_deadline < today;
              const isToday = d.demo_deadline === today;
              const isInterested = d.status === 'INTERESTED';
              return (
                <div
                  key={d.id}
                  className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                    isInterested
                      ? 'bg-emerald-50/60 border-emerald-300'
                      : isOverdue
                      ? 'bg-rose-50/60 border-rose-300'
                      : isToday
                      ? 'bg-amber-50/60 border-amber-300'
                      : 'bg-slate-50 border-slate-200'
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

                  <div className="mt-2 pt-2 border-t border-slate-200 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-slate-600">
                        {d.mobile || 'No Phone'}
                      </span>
                      {isInterested ? (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                          Ready for Admission
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-medium">
                          Post-Demo Action:
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      {!isInterested && (
                        <Button
                          size="xs"
                          variant="success"
                          onClick={(ev) => handleMarkInterested(d, ev)}
                          title="Student completed demo and is interested"
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
                        👎 Not Interested
                      </Button>
                      <Button
                        size="xs"
                        variant="primary"
                        onClick={() => handleConvertToAdmission(d)}
                        title="Proceed to full student registration and admission billing"
                      >
                        Admit ↗
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {[
          { label: 'All Enquiries', value: '' },
          { label: 'Active Demo', value: 'ACTIVE_DEMO' },
          { label: '👍 Interested (Post-Demo)', value: 'INTERESTED' },
          { label: 'Pending Demo', value: 'PENDING' },
          { label: 'Converted to Admission', value: 'CONVERTED' },
          { label: 'Expired Demo', value: 'EXPIRED' },
          { label: 'Not Interested (Dropped)', value: 'NOT_INTERESTED' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value);
              setPage(1);
            }}
            className={`px-3 py-1 text-xs rounded-full border transition font-medium ${
              statusFilter === tab.value
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
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
