import React from 'react';
import { Menu, Plus, UserPlus, CreditCard, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Button from '../common/Button';

export default function Topbar({ onToggleSidebar, onQuickStudent, onQuickPayment }) {
  const { user, canManageAdmissions, canCollectFees, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-1.5 rounded-md border border-slate-300 text-slate-700 hover:text-black hover:bg-slate-100 transition"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:block">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Thakurdwara Institute ERP
          </span>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <div className="flex items-center gap-2">
        {canManageAdmissions && (
          <Button
            size="xs"
            variant="primary"
            icon={Plus}
            onClick={() => navigate('/admissions/new')}
            className="sm:py-1.5 sm:px-2.5"
          >
            <span className="hidden sm:inline">New</span> Admission
          </Button>
        )}

        {canCollectFees && onQuickPayment && (
          <Button
            size="xs"
            variant="success"
            icon={CreditCard}
            onClick={onQuickPayment}
            className="sm:py-1.5 sm:px-2.5"
          >
            Collect Fee
          </Button>
        )}

        {canManageAdmissions && onQuickStudent && (
          <Button
            size="xs"
            variant="secondary"
            icon={UserPlus}
            onClick={onQuickStudent}
            className="hidden md:inline-flex"
          >
            Quick Student
          </Button>
        )}

        <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 hidden md:inline">
            Logged in as <strong className="text-black">{user?.full_name}</strong>
          </span>
          <button
            onClick={logout}
            title="Sign out"
            className="p-1.5 rounded-md text-slate-500 hover:text-rose-600 hover:bg-slate-100 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
