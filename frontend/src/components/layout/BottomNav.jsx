import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  CreditCard,
  Grid,
} from 'lucide-react';

/**
 * Mobile-first Bottom Navigation Bar for phones (screens < 768px).
 * Matches the hostel ERP bottom nav style.
 */
export default function BottomNav({ onOpenAppMenu }) {
  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/students', label: 'Students', icon: Users },
    { to: '/admissions', label: 'Admissions', icon: GraduationCap },
    { to: '/payments', label: 'Payments', icon: CreditCard },
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-center justify-around h-14 px-1 max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center flex-1 h-full py-1 px-1 transition-colors ${
                  isActive
                    ? 'text-purple-900 font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`relative p-1 rounded-xl transition-transform ${
                      isActive ? 'bg-purple-50 text-purple-900 scale-105' : ''
                    }`}
                  >
                    <Icon className="w-5 h-5 stroke-[2]" />
                  </div>
                  <span
                    className={`text-[10px] mt-0.5 tracking-tight truncate max-w-[56px] text-center ${
                      isActive ? 'font-bold text-purple-950' : 'text-slate-600'
                    }`}
                  >
                    {item.label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-purple-900" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}

        {/* Dynamic App Menu Launcher trigger button */}
        <button
          type="button"
          onClick={onOpenAppMenu}
          className="relative flex flex-col items-center justify-center flex-1 h-full py-1 px-1 text-slate-500 hover:text-purple-900 transition-colors cursor-pointer"
          title="Open Coaching ERP Apps"
          aria-label="Open Coaching ERP Apps"
        >
          <div className="p-1 rounded-xl text-slate-700 hover:bg-slate-100">
            <Grid className="w-5 h-5 stroke-[2]" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-medium text-slate-600">
            Apps
          </span>
        </button>
      </div>
    </nav>
  );
}
