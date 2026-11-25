import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  ClipboardList,
  BookOpen,
  CreditCard,
  ReceiptIndianRupee,
  MessageSquare,
  Wallet,
  BarChart3,
  TrendingUp,
  UserCog,
  History,
  Award,
  LogOut,
  ChevronRight,
  Sparkles,
  CalendarCheck,
  RotateCcw,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInstitute } from '../../context/InstituteContext';
import Badge from '../common/Badge';
import InstituteLogo from '../common/InstituteLogo';

export default function Sidebar({ isOpen, onClose }) {
  const { user, role, isAdmin, isCashier, isTeacher, logout } = useAuth();
  const { institute } = useInstitute();
  const instituteName = institute?.institute_name || 'THAKURDWARA COACHING INSTITUTE';

  const getNavSections = () => {
    const roleUpper = (role || 'ADMIN').toUpperCase();

    if (roleUpper === 'TEACHER') {
      return [
        {
          title: 'ACADEMICS',
          items: [
            {
              to: '/dashboard',
              label: 'Dashboard',
              icon: LayoutDashboard,
              show: true,
            },
            {
              to: '/demos',
              label: 'Demos',
              icon: ClipboardList,
              show: true,
            },
            {
              to: '/subjects',
              label: 'Subjects',
              icon: BookOpen,
              show: true,
            },
            {
              to: '/students',
              label: 'Students',
              icon: GraduationCap,
              show: true,
            },
          ],
        },
      ];
    }

    if (roleUpper === 'CASHIER') {
      return [
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
          title: 'STUDENTS & BILLING',
          items: [
            {
              to: '/students',
              label: 'Students',
              icon: GraduationCap,
              show: true,
            },
            {
              to: '/enquiries',
              label: 'Enquiries & Demos',
              icon: ClipboardList,
              show: true,
            },
            {
              to: '/enrollments',
              label: 'Enrollment (Courses)',
              icon: CreditCard,
              show: true,
            },
            {
              to: '/fees',
              label: 'Fees & Dues',
              icon: ReceiptIndianRupee,
              show: true,
            },
            {
              to: '/payments',
              label: 'Payments',
              icon: ReceiptIndianRupee,
              show: true,
            },
            {
              to: '/reminders',
              label: 'Reminders',
              icon: MessageSquare,
              show: true,
            },
            {
              to: '/renewals',
              label: 'Renewals',
              icon: RotateCcw,
              show: true,
            },
            {
              to: '/expenses',
              label: 'Expenses',
              icon: Wallet,
              show: true,
            },
          ],
        },
      ];
    }

    // ADMIN (and default full navigation)
    return [
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
        title: 'TEAM & ACCESS',
        items: [
          {
            to: '/users',
            label: 'Staff & Roles',
            icon: UserCog,
            show: true,
          },
        ],
      },
      {
        title: 'ENROLLMENTS & STUDENTS',
        items: [
          {
            to: '/enrollments',
            label: 'Enrollment (Courses)',
            icon: CreditCard,
            show: true,
          },
          {
            to: '/payments',
            label: 'Fee Payments',
            icon: ReceiptIndianRupee,
            show: true,
          },
          {
            to: '/reminders',
            label: 'Due Reminders',
            icon: MessageSquare,
            show: true,
          },
          {
            to: '/renewals',
            label: 'Renewals',
            icon: RotateCcw,
            show: true,
          },
          {
            to: '/students',
            label: 'Students',
            icon: GraduationCap,
            show: true,
          },
          {
            to: '/enquiries',
            label: 'Enquiries & Demos',
            icon: ClipboardList,
            show: true,
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
            show: true,
          },
          {
            to: '/teacher-attendance',
            label: 'Teacher Attendance',
            icon: CalendarCheck,
            show: true,
          },
          {
            to: '/subjects',
            label: 'Subjects & Classes',
            icon: BookOpen,
            show: true,
          },
          {
            to: '/green-card',
            label: 'Green Card Pass',
            icon: Award,
            show: true,
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
            show: true,
          },
          {
            to: '/reports',
            label: 'Reports Hub',
            icon: BarChart3,
            show: true,
          },
          {
            to: '/reports/subject-revenue',
            label: 'Subject Revenue',
            icon: BarChart3,
            show: true,
          },
          {
            to: '/reports/cash-flow',
            label: 'Cash Flow Trends',
            icon: TrendingUp,
            show: true,
          },
          {
            to: '/settings',
            label: 'Institute Settings',
            icon: Settings,
            show: true,
          },
          {
            to: '/audit-logs',
            label: 'Audit Trail',
            icon: History,
            show: true,
          },
        ],
      },
    ];
  };

  const navSections = getNavSections();

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
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-2xs shrink-0 p-0.5">
              <InstituteLogo
                src={institute?.logo_url}
                alt={instituteName}
                className="w-full h-full object-contain"
                fallback={
                  <div className="w-full h-full rounded bg-odoo-600 flex items-center justify-center text-white font-extrabold text-base tracking-wider">
                    {instituteName.charAt(0)}
                  </div>
                }
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs font-black text-black tracking-tight leading-tight uppercase truncate">
                {instituteName}
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
