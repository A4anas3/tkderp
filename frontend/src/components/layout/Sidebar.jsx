import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  ClipboardList,
  BookOpen,
  CalendarDays,
  CreditCard,
  ReceiptIndianRupee,
  MessageSquare,
  Wallet,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  History,
  Award,
  LogOut,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Badge from '../common/Badge';

export default function Sidebar({ isOpen, onClose }) {
  const { user, role, isAdmin, isCashier, isTeacher, logout } = useAuth();

  const navSections = [
    {
      title: 'CORE',
      items: [
        {
          to: '/dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          show: true,
        },
      ],
    },
    {
      title: 'ADMISSIONS & STUDENTS',
      items: [
        {
          to: '/admissions',
          label: 'Course Purchases',
          icon: CreditCard,
          show: isAdmin || isCashier,
        },
        {
          to: '/payments',
          label: 'Fee Payments',
          icon: ReceiptIndianRupee,
          show: isAdmin || isCashier,
        },
        {
          to: '/reminders',
          label: 'Due Reminders',
          icon: MessageSquare,
          show: isAdmin || isCashier,
        },
        {
          to: '/students',
          label: 'Students',
          icon: GraduationCap,
          show: isAdmin || isCashier,
        },
        {
          to: '/enquiries',
          label: 'Enquiries & Demos',
          icon: ClipboardList,
          show: isAdmin || isCashier,
        },
      ],
    },
    {
      title: 'ACADEMICS & FACULTY',
      items: [
        {
          to: '/teachers',
          label: 'Faculty & Teachers',
          icon: Users,
          show: isAdmin,
        },
        {
          to: '/subjects',
          label: 'Subjects & Classes',
          icon: BookOpen,
          show: isAdmin,
        },
        {
          to: '/batches',
          label: 'Coaching Batches',
          icon: CalendarDays,
          show: isAdmin,
        },
        {
          to: '/green-card',
          label: 'Green Card Pass',
          icon: Award,
          show: isAdmin,
        },
      ],
    },
    {
      title: 'FINANCE & REPORTING',
      items: [
        {
          to: '/expenses',
          label: 'Expenses & Salaries',
          icon: Wallet,
          show: isAdmin,
        },
        {
          to: '/reports',
          label: 'Reports Hub',
          icon: BarChart3,
          show: isAdmin || isCashier,
        },
        {
          to: '/reports/subject-revenue',
          label: 'Subject Revenue',
          icon: BarChart3,
          show: isAdmin,
        },
        {
          to: '/reports/cash-flow',
          label: 'Cash Flow Trends',
          icon: TrendingUp,
          show: isAdmin,
        },
        {
          to: '/users',
          label: 'Staff & Roles',
          icon: ShieldCheck,
          show: isAdmin,
        },
        {
          to: '/audit-logs',
          label: 'Audit Trail',
          icon: History,
          show: isAdmin,
        },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-odoo-600 flex items-center justify-center text-white shadow-2xs font-extrabold text-base tracking-wider">
              T
            </div>
            <div>
              <h1 className="text-sm font-bold text-black tracking-tight leading-tight">
                THAKURDWARA
              </h1>
              <p className="text-[10px] uppercase font-bold text-odoo-700 tracking-wider">
                Coaching ERP
              </p>
            </div>
          </div>
        </div>

        {/* User Card */}
        <div className="p-3 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-black font-bold text-xs uppercase shrink-0">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-black truncate">{user?.full_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] text-slate-700 font-mono font-semibold">
                  {user?.employee_id}
                </span>
                <Badge
                  size="xs"
                  variant={isAdmin ? 'primary' : isCashier ? 'warning' : 'success'}
                >
                  {role}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation links grouped into Odoo-style sections */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
          {navSections.map((sec, sIdx) => {
            const visibleItems = sec.items.filter((itm) => itm.show);
            if (visibleItems.length === 0) return null;

            return (
              <div key={sIdx} className="space-y-1">
                <div className="px-2.5 text-[10px] font-black uppercase tracking-wider text-slate-600">
                  {sec.title}
                </div>
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center justify-between min-h-[38px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors touch-manipulation cursor-pointer ${
                        isActive
                          ? 'bg-odoo-600 text-white shadow-2xs font-bold'
                          : 'text-slate-800 hover:text-black hover:bg-slate-100 active:bg-slate-200'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-2.5">
                          <item.icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-white' : 'text-slate-500'
                            }`}
                          />
                          <span>{item.label}</span>
                        </div>
                        {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/80" />}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50 shrink-0">
          <button
            onClick={logout}
            className="w-full min-h-[38px] flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900 hover:bg-rose-50 active:bg-rose-100 rounded-md border border-rose-200 transition shadow-2xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
