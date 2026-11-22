import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Plus, CreditCard, UserPlus, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Button from '../common/Button';

export default function Topbar({ onToggleSidebar, onQuickStudent, onQuickPayment }) {
  const { user, role, isAdmin, isCashier, logout } = useAuth();
  const navigate = useNavigate();

  const canManageAdmissions = isAdmin || isCashier;

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden min-h-[38px] min-w-[38px] p-2 rounded-md border border-slate-300 text-slate-700 hover:text-black hover:bg-slate-100 active:bg-slate-200 transition flex items-center justify-center shadow-2xs touch-manipulation cursor-pointer"
          aria-label="Toggle menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-700">
            Thakurdwara ERP
          </span>
        </div>
      </div>

      {/* Quick Action Shortcuts - Odoo style */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {canManageAdmissions && (
          <Button
            size="xs"
            variant="primary"
            icon={Plus}
            onClick={() => navigate('/admissions/new')}
            className="min-h-[36px] sm:min-h-[32px] px-3 sm:px-2.5 py-1.5 sm:py-1 text-xs font-bold whitespace-nowrap shadow-2xs"
            title="Purchase & Pay for Course Batches"
          >
            Course Paid
          </Button>
        )}

        {canManageAdmissions && (
          <Button
            size="xs"
            variant="success"
            icon={CreditCard}
            onClick={onQuickPayment}
            className="min-h-[36px] sm:min-h-[32px] px-3 sm:px-2.5 py-1.5 sm:py-1 text-xs font-bold whitespace-nowrap shadow-2xs"
            title="Collect Outstanding Fee (Select Student & Invoice)"
          >
            Collect Fee
          </Button>
        )}

        {canManageAdmissions && (
          <Button
            size="xs"
            variant="secondary"
            icon={UserPlus}
            onClick={onQuickStudent}
            className="hidden md:inline-flex min-h-[32px] whitespace-nowrap font-bold"
            title="Admit / Register New Student"
          >
            New Admission
          </Button>
        )}

        <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block" />

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 pl-1">
            <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-xs font-bold text-black">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <span className="text-xs text-slate-700">
              <strong className="text-black font-semibold">{user?.full_name}</strong>
            </span>
          </div>

          <button
            onClick={logout}
            title="Sign out"
            className="min-h-[36px] min-w-[36px] p-2 rounded-md text-slate-600 hover:text-rose-700 hover:bg-rose-50 active:bg-rose-100 transition flex items-center justify-center shrink-0 border border-slate-300 shadow-2xs touch-manipulation cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
