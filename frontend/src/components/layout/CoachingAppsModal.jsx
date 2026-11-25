import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  BookOpen,
  GraduationCap,
  Receipt,
  CreditCard,
  Bell,
  BarChart3,
  QrCode,
  UserCheck,
  LifeBuoy,
  ShieldAlert,
  Settings,
  Sparkles,
  X,
  Wallet,
  CalendarCheck,
  RotateCcw,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Coaching ERP Apps Modal
 * Odoo / Hostel ERP inspired module picker grid.
 * Displays all 13 coaching modules with rich squircle icon tiles,
 * titles, and subtitles.
 */
export default function CoachingAppsModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { role, isAdmin, isCashier, isTeacher } = useAuth();

  if (!isOpen) return null;

  // 13 Coaching Modules
  const allApps = [
    {
      id: 'students',
      name: 'Students',
      desc: 'Profiles & ID Cards',
      icon: Users,
      route: '/students',
      color: 'bg-indigo-600',
      roles: ['ADMIN', 'CASHIER', 'TEACHER'],
    },
    {
      id: 'subjects',
      name: 'Subjects',
      desc: 'Courses & Pricing',
      icon: BookOpen,
      route: '/subjects',
      color: 'bg-blue-600',
      roles: ['ADMIN', 'CASHIER', 'TEACHER'],
    },
    {
      id: 'admissions',
      name: 'Enrollment (Courses)',
      desc: 'Course Enrolments',
      icon: GraduationCap,
      route: '/enrollments',
      color: 'bg-purple-600',
      roles: ['ADMIN', 'CASHIER'],
    },
    {
      id: 'fees',
      name: 'Fees & Dues',
      desc: 'Ledgers & Dues Aging',
      icon: Receipt,
      route: '/fees',
      color: 'bg-emerald-600',
      roles: ['ADMIN', 'CASHIER'],
    },
    {
      id: 'payments',
      name: 'Payments Desk',
      desc: 'Manual Cash / UPI Entry',
      icon: CreditCard,
      route: '/payments',
      color: 'bg-teal-600',
      roles: ['ADMIN', 'CASHIER'],
    },
    {
      id: 'reminders',
      name: 'Reminders Queue',
      desc: 'WhatsApp Click-to-Send',
      icon: Bell,
      route: '/reminders',
      color: 'bg-orange-600',
      roles: ['ADMIN', 'CASHIER'],
    },
    {
      id: 'renewals',
      name: 'Renewals',
      desc: 'Expiring & Expired Courses',
      icon: RotateCcw,
      route: '/renewals',
      color: 'bg-rose-600',
      roles: ['ADMIN', 'CASHIER'],
    },
    {
      id: 'reports',
      name: 'Reports Hub',
      desc: '10 Ledger Reports & Analytics',
      icon: BarChart3,
      route: '/reports',
      color: 'bg-cyan-600',
      roles: ['ADMIN'],
    },
    {
      id: 'verify',
      name: 'ID Card / QR Verify',
      desc: 'Public QR Verification',
      icon: QrCode,
      route: '/verify',
      color: 'bg-purple-600',
      roles: ['ADMIN', 'CASHIER'],
    },
    {
      id: 'teachers',
      name: 'Teachers',
      desc: 'Faculty & Payouts',
      icon: UserCheck,
      route: '/teachers',
      color: 'bg-emerald-600',
      roles: ['ADMIN', 'CASHIER'],
    },
    {
      id: 'teacher-attendance',
      name: 'Teacher Attendance',
      desc: 'Mark Monthly Absences',
      icon: CalendarCheck,
      route: '/teacher-attendance',
      color: 'bg-teal-700',
      roles: ['ADMIN', 'CASHIER'],
    },
    {
      id: 'expenses',
      name: 'Expenses',
      desc: 'Daily & Salaries',
      icon: Wallet,
      route: '/expenses',
      color: 'bg-rose-600',
      roles: ['ADMIN', 'CASHIER'],
    },
    {
      id: 'enquiries',
      name: 'Enquiries',
      desc: 'Leads & Demo Passes',
      icon: LifeBuoy,
      route: '/enquiries',
      color: 'bg-amber-600',
      roles: ['ADMIN'],
    },
    {
      id: 'demos',
      name: 'Active Demos',
      desc: 'Trial Classes & Schedule',
      icon: LifeBuoy,
      route: '/demos',
      color: 'bg-amber-600',
      roles: ['CASHIER', 'TEACHER'],
    },
    {
      id: 'audit',
      name: 'Audit Log',
      desc: 'Security & Changes',
      icon: ShieldAlert,
      route: '/audit-logs',
      color: 'bg-zinc-800',
      roles: ['ADMIN'],
    },
    {
      id: 'settings',
      name: 'Settings',
      desc: 'Staff & System Setup',
      icon: Settings,
      route: '/settings',
      color: 'bg-slate-700',
      roles: ['ADMIN'],
    },
    {
      id: 'users',
      name: 'Staff & Roles',
      desc: 'Users, Passwords & Roles',
      icon: UserCog,
      route: '/users',
      color: 'bg-indigo-700',
      roles: ['ADMIN'],
    },
  ];

  // If role is ADMIN, all apps are shown. Otherwise filter by roles if defined.
  const currentRole = (role || 'ADMIN').toUpperCase();
  const allowedApps = allApps.filter((app) =>
    currentRole === 'ADMIN' ? true : app.roles.includes(currentRole)
  );

  const handleNavigate = (route) => {
    onClose();
    navigate(route);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl sm:max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coaching-apps-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#714B67] flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3
                id="coaching-apps-title"
                className="text-base font-bold text-slate-900 leading-tight"
              >
                Coaching ERP Apps
              </h3>
              <p className="text-xs text-slate-500">Select an application module</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4-column App Grid */}
        <div className="p-4 sm:p-6 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {allowedApps.map((app) => {
            const Icon = app.icon;
            return (
              <div
                key={app.id}
                data-app-id={app.id}
                onClick={() => handleNavigate(app.route)}
                className="group flex flex-col items-center text-center p-3 sm:p-3.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-purple-50/50 hover:shadow-md cursor-pointer transition-all duration-150 active:scale-95"
              >
                <div
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl ${app.color} text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform`}
                >
                  <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <span className="mt-2 text-xs sm:text-[13px] font-bold text-slate-800 group-hover:text-[#714B67] transition-colors leading-tight text-center">
                  {app.name}
                </span>
                <span className="text-[10px] text-slate-400 line-clamp-1 mt-0.5 max-w-[130px]">
                  {app.desc}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-100 text-center text-[11px] text-slate-500 shrink-0">
          Role-scoped access:{' '}
          <span className="font-semibold uppercase text-[#714B67]">{currentRole}</span>
        </div>
      </div>
    </div>
  );
}
