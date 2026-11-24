import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Grid,
  Search,
  Bell,
  ShieldCheck,
  ChevronDown,
  LogOut,
  Settings,
  Plus,
  CreditCard,
  UserPlus,
  GraduationCap,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Top Navbar restyled in Odoo / Hostel ERP style (#714B67 brand background).
 * Matches hostel pattern:
 * - App Launcher (3x3 grid icon) opening Coaching ERP Apps modal
 * - Brand logo & title
 * - Module links (Dashboard, Students, Subjects, Admissions, Fees & Dues, Payments, Reminders, Teachers, Enquiries, Reports, Settings)
 * - Compact action buttons (Course Paid, Collect Fee, New Enrollment)
 * - Quick Search bar
 * - Admin role chip with dropdown
 * - Notification bell with active alert dot
 * - User avatar chip with profile & logout menu
 */
export default function Topbar({ onOpenAppMenu, onQuickStudent, onQuickPayment }) {
  const { user, role, isAdmin, isCashier, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const profileRef = useRef(null);
  const roleRef = useRef(null);

  const canManageAdmissions = isAdmin || isCashier;

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
      if (roleRef.current && !roleRef.current.contains(event.target)) {
        setRoleDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/students?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Role-based navigation links strictly enforcing visibility by role:
  // - ADMIN: sees full nav
  // - TEACHER: sees Dashboard, Demos, Subjects, Students
  // - CASHIER: sees ONLY Dashboard, Students, Admissions, Fees & Dues, Payments, Reminders, Renewals
  const getNavLinks = () => {
    const roleUpper = (role || 'ADMIN').toUpperCase();
    if (roleUpper === 'TEACHER') {
      return [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/demos', label: 'Demos' },
        { to: '/subjects', label: 'Subjects' },
        { to: '/students', label: 'Students' },
      ];
    }
    if (roleUpper === 'CASHIER') {
      return [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/students', label: 'Students' },
        { to: '/enrollments', label: 'Enrollment (Courses)' },
        { to: '/fees', label: 'Fees & Dues' },
        { to: '/payments', label: 'Payments' },
        { to: '/reminders', label: 'Reminders' },
        { to: '/renewals', label: 'Renewals' },
      ];
    }
    // ADMIN (and fallback)
    return [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/students', label: 'Students' },
      { to: '/subjects', label: 'Subjects' },
      { to: '/enrollments', label: 'Enrollment (Courses)' },
      { to: '/fees', label: 'Fees & Dues' },
      { to: '/payments', label: 'Payments' },
      { to: '/reminders', label: 'Reminders' },
      { to: '/renewals', label: 'Renewals' },
      { to: '/expenses', label: 'Expenses' },
      { to: '/teachers', label: 'Teachers' },
      { to: '/teacher-attendance', label: 'Teacher Attendance' },
      { to: '/enquiries', label: 'Enquiries' },
      { to: '/reports', label: 'Reports' },
      { to: '/settings', label: 'Settings' },
    ];
  };

  const navLinks = getNavLinks();

  return (
    <header className="sticky top-0 z-40 bg-[#714B67] text-white shadow-sm border-b border-[#5e3c54]">
      <div className="flex items-center justify-between h-12 sm:h-13 px-2 sm:px-4 w-full gap-2">
        {/* Left Section: App Launcher + Brand */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Apps Launcher Button (3x3 Grid Icon) */}
          <button
            type="button"
            onClick={onOpenAppMenu}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer flex items-center justify-center shrink-0"
            title="Open Coaching ERP Apps"
            aria-label="Apps launcher"
          >
            <Grid className="w-5 h-5 text-white" />
          </button>

          {/* Brand Logo & Name */}
          <NavLink
            to="/dashboard"
            className="flex items-center space-x-1.5 font-bold tracking-tight text-white hover:text-white/90 shrink-0"
            title="Thakurdwara Coaching Institute"
          >
            <div className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-teal-300 transition-colors">
              <GraduationCap className="w-4 h-4" />
            </div>
            <span className="text-sm hidden 2xl:inline font-bold">
              Thakurdwara<span className="text-teal-300">ERP</span>
            </span>
          </NavLink>
        </div>

        {/* Center: Desktop Module Navigation Links (Hostel pattern) */}
        <nav className="hidden lg:flex items-center space-x-0.5 xl:space-x-1 overflow-x-auto no-scrollbar flex-1 min-w-0 mx-1">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `px-1.5 xl:px-2 py-1 text-[11px] xl:text-xs font-medium rounded whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-white/20 text-white font-semibold'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Right Section: Quick Actions + Search + Admin Chip + Bell + Avatar */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Quick Action Shortcuts (F11 compact single-line button style, F12 semantic colors) */}
          {canManageAdmissions && (
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/enrollments/new')}
                className="inline-flex items-center gap-1 h-8 min-h-[32px] py-1 px-2 text-xs font-bold rounded-md bg-purple-900/60 hover:bg-purple-900 active:bg-purple-950 text-white border border-purple-300/30 shadow-2xs whitespace-nowrap cursor-pointer transition-all"
                title="Purchase & Pay for Courses"
              >
                <Plus className="w-3.5 h-3.5" />
                Course Paid
              </button>

              <button
                type="button"
                onClick={onQuickPayment}
                className="inline-flex items-center gap-1 h-8 min-h-[32px] py-1 px-2 text-xs font-bold rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-2xs whitespace-nowrap cursor-pointer transition-all"
                title="Collect Outstanding Fee (Select Student & Invoice)"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Collect Fee
              </button>

              <button
                type="button"
                onClick={onQuickStudent}
                className="hidden xl:inline-flex items-center gap-1 h-8 min-h-[32px] py-1 px-2 text-xs font-bold rounded-md bg-white/10 hover:bg-white/20 active:bg-white/30 text-white border border-white/25 shadow-2xs whitespace-nowrap cursor-pointer transition-all"
                title="Enroll / Register New Student"
              >
                <UserPlus className="w-3.5 h-3.5" />
                New Enrollment
              </button>
            </div>
          )}

          {/* Quick Search Bar */}
          <div className="hidden md:flex max-w-[140px] xl:max-w-[180px]">
            <form onSubmit={handleSearchSubmit} className="relative w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search students..."
                className="w-full h-8 pl-7 pr-2.5 text-xs text-slate-900 bg-white/95 placeholder-slate-500 rounded-md border-0 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
              <Search className="absolute left-2 top-2 w-4 h-4 text-slate-500 pointer-events-none" />
            </form>
          </div>

          {/* Admin Role Chip */}
          <div className="relative" ref={roleRef}>
            <button
              type="button"
              onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
              className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-teal-500/30 text-teal-100 hover:bg-teal-500/40 border border-teal-300/30 transition-colors cursor-pointer"
              title="Active Staff Role"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-teal-300" />
              <span className="capitalize text-[11px] font-semibold">
                {role ? role.toLowerCase() : 'admin'}
              </span>
              <ChevronDown className="w-3 h-3 text-teal-200" />
            </button>

            {roleDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in slide-in-from-top-1">
                <div className="px-3 py-1.5 border-b border-slate-100 font-semibold text-slate-500 text-[10px] uppercase tracking-wider">
                  Active Staff Role
                </div>
                <div className="px-3 py-2 flex items-center justify-between font-bold text-purple-900 bg-purple-50/60">
                  <span className="capitalize">{role ? role.toLowerCase() : 'admin'}</span>
                  <CheckCircle className="w-3.5 h-3.5 text-purple-900" />
                </div>
                <div className="px-3 py-1 text-[11px] text-slate-500">
                  Signed in as{' '}
                  <strong className="text-slate-700">{user?.full_name || 'Staff'}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Notifications Bell (Admin & Cashier only) */}
          {(isAdmin || isCashier) && (
            <button
              type="button"
              onClick={() => navigate('/reminders')}
              className="relative p-1.5 rounded-full hover:bg-white/15 transition-colors text-white cursor-pointer"
              title="Due Reminders & WhatsApp Queue"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#714B67]" />
            </button>
          )}

          {/* User Profile Avatar Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center space-x-1 p-1 rounded-full hover:bg-white/15 transition-colors focus:outline-none cursor-pointer"
              aria-label="User menu"
            >
              <div className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs ring-1 ring-white/50">
                {user?.full_name?.charAt(0) || 'A'}
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-1.5 w-52 bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in slide-in-from-top-1">
                <div className="px-3.5 py-2 border-b border-slate-100">
                  <p className="font-bold text-slate-900 truncate">
                    {user?.full_name || 'Staff User'}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    ID: {user?.employee_id || user?.username || 'ADM001'}
                  </p>
                  <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-900 rounded capitalize">
                    {role || 'ADMIN'} Access
                  </span>
                </div>

                {isAdmin && (
                  <div className="py-1">
                    <NavLink
                      to="/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center px-3.5 py-2 text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Settings className="w-4 h-4 mr-2 text-slate-400" />
                      Institute Settings
                    </NavLink>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center px-3.5 py-2 text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 mr-2 text-rose-500" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
