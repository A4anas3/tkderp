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
  Wallet,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  Award,
  LogOut,
  ChevronRight,
  School,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Badge from '../common/Badge';

export default function Sidebar({ isOpen, onClose }) {
  const { user, role, isAdmin, isCashier, isTeacher, logout } = useAuth();

  const getNavItems = () => {
    const items = [
      {
        to: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
      },
    ];

    if (isAdmin || isCashier) {
      items.push(
        {
          to: '/admissions',
          label: 'Course Purchases',
          icon: CreditCard,
        },
        {
          to: '/payments',
          label: 'Fee Payments',
          icon: ReceiptIndianRupee,
        },
        {
          to: '/students',
          label: 'Students',
          icon: GraduationCap,
        },
        {
          to: '/enquiries',
          label: 'Enquiries & Demos',
          icon: ClipboardList,
        }
      );
    }

    if (isAdmin) {
      items.push(
        {
          to: '/teachers',
          label: 'Faculty & Teachers',
          icon: Users,
        },
        {
          to: '/subjects',
          label: 'Subjects & Classes',
          icon: BookOpen,
        },
        {
          to: '/green-card',
          label: 'Green Card Pass',
          icon: Award,
        },
        {
          to: '/expenses',
          label: 'Expenses & Salaries',
          icon: Wallet,
        },
        {
          to: '/reports/subject-revenue',
          label: 'Subject Revenue',
          icon: BarChart3,
        },
        {
          to: '/reports/cash-flow',
          label: 'Cash Flow Trends',
          icon: TrendingUp,
        },
        {
          to: '/users',
          label: 'Staff & Roles',
          icon: ShieldCheck,
        }
      );
    }

    if (isTeacher) {
      // Teachers only see their dashboard & roster
    }

    return items;
  };

  const navItems = getNavItems();

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
        <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm font-bold text-base">
              T
            </div>
            <div>
              <h1 className="text-sm font-bold text-black tracking-tight leading-tight">
                THAKURDWARA
              </h1>
              <p className="text-[10px] uppercase font-bold text-indigo-700 tracking-wider">
                Coaching ERP
              </p>
            </div>
          </div>
        </div>

        {/* User Card */}
        <div className="p-3 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-black font-bold text-xs uppercase">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-black truncate">{user?.full_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] text-slate-500 font-mono">
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

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-700 hover:text-black hover:bg-slate-100'
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
        </nav>

        {/* Bottom actions */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50">
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-rose-700 hover:text-rose-900 hover:bg-rose-50 rounded-md border border-rose-200 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
