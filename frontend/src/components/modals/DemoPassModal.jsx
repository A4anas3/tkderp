import React, { useRef } from 'react';
import {
  Printer,
  Calendar,
  User,
  Phone,
  BookOpen,
  MapPin,
  CheckCircle2,
  Clock,
  Award,
  AlertCircle,
  Hash,
  Download,
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import InstituteLogo from '../common/InstituteLogo';
import { useInstitute } from '../../context/InstituteContext';
import { formatIndianDate } from '../../utils/dateCycleUtils';

export default function DemoPassModal({
  isOpen,
  onClose,
  enquiry,
  demoItem = null,
}) {
  const { institute } = useInstitute();
  const instituteName = institute?.institute_name || 'THAKURDWARA COACHING INSTITUTE';
  const printRef = useRef(null);

  if (!isOpen || !enquiry) return null;

  // If specific demoItem passed, display that single item; else display all enquiry.demo_items
  const items = demoItem
    ? [demoItem]
    : enquiry.demo_items && enquiry.demo_items.length > 0
    ? enquiry.demo_items
    : [
        {
          id: 'single',
          demo_reference_number: enquiry.demo_reference_number || 'DEM-PENDING',
          subject_name_snapshot: enquiry.interested_subject || 'General Coaching',
          teacher_name_snapshot: 'Assigned Institute Faculty',
          hall_number_snapshot: 'Main Hall',
          demo_start_date: enquiry.demo_start_date,
          demo_end_date: enquiry.demo_deadline,
          demo_duration_days: enquiry.demo_duration_days || 3,
          status: enquiry.status || 'ACTIVE_DEMO',
        },
      ];

  const handlePrint = () => {
    window.print();
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'ACTIVE':
      case 'ACTIVE_DEMO':
        return 'primary';
      case 'ATTENDED':
        return 'warning';
      case 'CONVERTED':
        return 'success';
      case 'DROPPED':
      case 'NOT_INTERESTED':
        return 'neutral';
      case 'EXPIRED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Official Demo Trial Pass / Slip"
      subtitle={`Student: ${enquiry.student_name} • Issued Reference Slip`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Printable Pass Container */}
        <div
          ref={printRef}
          className="bg-white border-2 border-slate-900 rounded-xl p-5 shadow-xs print:p-0 print:border-none print:shadow-none space-y-4"
        >
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {institute?.logo_url && (
                <div className="w-12 h-12 rounded-lg border border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0 p-0.5">
                  <InstituteLogo
                    src={institute.logo_url}
                    alt={instituteName}
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-slate-950 text-white text-xs font-black px-2 py-0.5 rounded tracking-widest uppercase">
                    TRIAL PASS
                  </span>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    ERP Verified
                  </span>
                </div>
                <h2 className="text-lg font-black text-black tracking-tight mt-1 uppercase">
                  {instituteName}
                </h2>
                <p className="text-[11px] text-slate-600 font-medium">
                  Official Classroom Demo Entry Authorization
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Date Issued
              </span>
              <span className="text-xs font-mono font-bold text-black">
                {formatIndianDate(enquiry.created_at || new Date().toISOString())}
              </span>
              <span className="text-[10px] text-odoo-800 font-mono font-bold block mt-0.5">
                {items.length === 1 && items[0]?.demo_reference_number
                  ? `Demo ID: ${items[0].demo_reference_number}`
                  : enquiry.enquiry_code
                  ? `Enquiry: ${enquiry.enquiry_code}`
                  : `Demo ID: ${items[0]?.demo_reference_number || 'NEW'}`}
              </span>
            </div>
          </div>

          {/* Student Info Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Candidate Name
              </span>
              <span className="font-bold text-black text-sm block break-words">
                {enquiry.student_name}
              </span>
              {enquiry.purpose && (
                <span className="text-[10px] text-slate-500 block">{enquiry.purpose}</span>
              )}
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Contact Mobile
              </span>
              <span className="font-mono font-bold text-black text-sm block">
                {enquiry.mobile || '—'}
              </span>
              <span className="text-[10px] text-slate-500">Registered Lead</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Enquiry Status
              </span>
              <Badge size="xs" variant={getStatusBadgeVariant(enquiry.status)}>
                {enquiry.status?.replace('_', ' ')}
              </Badge>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Total Demo Subjects: {items.length}
              </span>
            </div>
          </div>

          {/* Demo Subject Reference Tickets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-odoo-600" />
                <span>Authorized Subject Trial Classes ({items.length})</span>
              </span>
              <span className="text-[11px] text-slate-500">
                1 Reference Number per Subject
              </span>
            </div>

            <div className="divide-y divide-slate-200 border border-slate-300 rounded-lg overflow-hidden bg-white">
              {items.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-purple-50 border border-odoo-200 font-mono font-bold text-xs text-odoo-900 tracking-wider whitespace-nowrap shrink-0">
                        {item.demo_reference_number || `DEM-2026-${String(idx + 1).padStart(4, '0')}`}
                      </span>
                      <h4 className="font-bold text-black text-sm">
                        {item.subject_name || item.subject_name_snapshot || enquiry.interested_subject || 'Subject Demo'}
                      </h4>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 pt-0.5">
                      <span className="flex items-center gap-1 font-medium">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>Faculty: <strong className="text-black">{item.teacher_name || item.teacher_name_snapshot || 'Faculty Assigned'}</strong></span>
                      </span>
                      <span className="flex items-center gap-1 font-medium">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>Room: <strong className="text-black">{item.hall_number || item.hall_number_snapshot || 'Classroom'}</strong></span>
                      </span>
                    </div>
                  </div>

                  <div className="sm:text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                    <div className="text-xs font-mono font-bold text-black">
                      {formatIndianDate(item.demo_start_date)}
                      {item.demo_end_date && ` → ${formatIndianDate(item.demo_end_date)}`}
                    </div>
                    <div className="flex items-center sm:justify-end gap-1.5 mt-1">
                      <span className="text-[11px] text-slate-500 font-medium">
                        Duration: {item.demo_duration_days || 3} Days
                      </span>
                      <Badge size="xs" variant={getStatusBadgeVariant(item.status)}>
                        {item.status || 'ACTIVE'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Guidelines / Terms */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <span className="font-bold text-black uppercase tracking-wider block text-[10px]">
              Instructions for Candidate & Faculty:
            </span>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Carry this trial pass to the allocated classroom during trial days.</li>
              <li>Teacher / Coordinator will verify the reference number prior to lecture admission.</li>
              <li>Free demo trial is valid solely for the duration specified. To secure regular subject enrollment, contact the front desk.</li>
            </ul>
          </div>

          {/* Footer signature line */}
          <div className="pt-4 border-t border-slate-200 flex items-end justify-between text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block font-mono">
                System Generated Verification Slip
              </span>
              <span className="text-black font-semibold">
                {instituteName} Administration Desk
              </span>
            </div>
            <div className="text-center">
              <div className="border-b border-black w-32 mb-1"></div>
              <span className="text-[10px] text-slate-500 font-medium">
                Authorized Signatory
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200 print:hidden">
          <span className="text-xs text-slate-500 text-center sm:text-left">
            Print on A4 / Thermal or save as PDF
          </span>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">
              Close
            </Button>
            <Button variant="primary" icon={Printer} onClick={handlePrint} className="w-full sm:w-auto">
              Print Demo Slip
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
