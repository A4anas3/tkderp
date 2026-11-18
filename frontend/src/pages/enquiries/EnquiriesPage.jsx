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
} from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { enquiryApi } from '../../services/allApis';
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
  const [submitting, setSubmitting] = useState(false);
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
        demo_duration_days: parseInt(formData.demo_duration_days) || 0,
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

  const handleConvertToAdmission = (enq) => {
    navigate(
      `/admissions/new?enquiry_id=${enq.id}&name=${encodeURIComponent(
        enq.student_name
      )}&mobile=${encodeURIComponent(enq.mobile || '')}&subject=${encodeURIComponent(
        enq.interested_subject || ''
      )}`
    );
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
      accessor: 'interested_subject',
      className: 'text-xs font-medium text-slate-800',
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
      className: 'text-center w-28',
      render: (e) => {
        const variants = {
          ACTIVE_DEMO: 'primary',
          PENDING: 'warning',
          CONVERTED: 'success',
          EXPIRED: 'danger',
          NOT_INTERESTED: 'neutral',
        };
        return (
          <Badge size="xs" variant={variants[e.status] || 'neutral'}>
            {e.status.replace('_', ' ')}
          </Badge>
        );
      },
    },
    {
      header: 'Action',
      className: 'text-right w-36',
      render: (e) =>
        e.status !== 'CONVERTED' ? (
          <Button
            size="xs"
            variant="primary"
            onClick={() => handleConvertToAdmission(e)}
          >
            Admit Student
          </Button>
        ) : (
          <Badge size="xs" variant="success">
            Enrolled
          </Badge>
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
            Track student walk-ins, free demo periods, upcoming deadlines, and convert to admission
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
              return (
                <div
                  key={d.id}
                  className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                    isOverdue
                      ? 'bg-rose-50/60 border-rose-300'
                      : isToday
                      ? 'bg-amber-50/60 border-amber-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-black text-sm">{d.student_name}</span>
                      <Badge size="xs" variant={isOverdue ? 'danger' : isToday ? 'warning' : 'primary'}>
                        {isOverdue ? 'Expired' : isToday ? 'Ends Today' : 'Active'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Subject: <strong className="text-black">{d.interested_subject || 'General'}</strong>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Deadline: <strong className="font-mono text-black">{d.demo_deadline}</strong>
                    </p>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-600">
                      {d.mobile || 'No Phone'}
                    </span>
                    <Button
                      size="xs"
                      variant="primary"
                      onClick={() => handleConvertToAdmission(d)}
                    >
                      Complete Admission
                    </Button>
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
          { label: 'Pending', value: 'PENDING' },
          { label: 'Converted to Admission', value: 'CONVERTED' },
          { label: 'Expired Demo', value: 'EXPIRED' },
          { label: 'Not Interested', value: 'NOT_INTERESTED' },
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
    </div>
  );
}
