import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInstitute } from '../../context/InstituteContext';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import InstituteLogo from '../../components/common/InstituteLogo';
import { resolvePublicInstituteLogoUrl } from '../../utils/protectedImage';

const DEMO_ACCOUNTS = [
  {
    role: 'Admin',
    username: 'ADM001',
    password: 'fQ@bzDhrGWOy+IiOI1n$',
    hoverClass: 'hover:bg-purple-50 hover:border-odoo-400 active:bg-purple-100',
  },
  {
    role: 'Cashier',
    username: 'CSH001',
    password: 'Ov2$s27#u7R1x7S_$6wQ',
    hoverClass: 'hover:bg-amber-50 hover:border-amber-400 active:bg-amber-100',
  },
  {
    role: 'Teacher',
    username: 'TCH001',
    password: '8irzM%3-g5-4s8NB2Kt*',
    hoverClass: 'hover:bg-emerald-50 hover:border-emerald-400 active:bg-emerald-100',
  },
];

export default function LoginPage() {
  const { login } = useAuth();
  const { institute } = useInstitute();
  const instituteName = institute?.institute_name || 'THAKURDWARA COACHING INSTITUTE';
  const navigate = useNavigate();
  const [username, setUsername] = useState(DEMO_ACCOUNTS[0].username);
  const [password, setPassword] = useState(DEMO_ACCOUNTS[0].password);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const performLogin = async (u, p) => {
    setErrorMessage('');
    if (!u.trim() || !p) {
      setErrorMessage('Please enter both Employee ID and Password.');
      return;
    }

    setLoading(true);
    try {
      await login(u.trim(), p);
      navigate('/dashboard');
    } catch (err) {
      setErrorMessage(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await performLogin(username, password);
  };

  const handleQuickLogin = async (u, p) => {
    setUsername(u);
    setPassword(p);
    await performLogin(u, p);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Header - Odoo ERP brand styling */}
        <div className="bg-gradient-to-r from-odoo-700 via-odoo-600 to-odoo-800 p-6 text-white text-center">
          <div className="w-16 h-16 bg-white text-odoo-700 font-black text-2xl rounded-xl mx-auto flex items-center justify-center shadow-md mb-2.5 overflow-hidden p-1">
            <InstituteLogo
              src={resolvePublicInstituteLogoUrl(institute?.logo_url)}
              alt={instituteName}
              className="w-full h-full object-contain"
              fallback={<span>{instituteName.charAt(0)}</span>}
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight uppercase">{instituteName}</h1>
          <p className="text-xs text-purple-200 uppercase tracking-widest font-semibold mt-1">
            Institute Management ERP
          </p>
        </div>

        {/* Login Form */}
        <div className="p-6">
          <div className="mb-5">
            <h2 className="text-base font-bold text-black">Internal Staff Login</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Access restricted to authorized Admin, Cashier & Faculty staff only.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-300 rounded-lg flex items-center gap-2 text-xs text-rose-900 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Employee ID or Staff Email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. ADM001 or CSH001"
              required
              autoFocus
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your staff password"
              required
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={loading}
              icon={LogIn}
              className="w-full mt-2"
            >
              Sign In to ERP
            </Button>
          </form>

          {/* Quick Demo Logins for Fast Evaluation */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2.5">
              Fast One-Click Demo Access
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map(({ role, username: demoUser, password: demoPassword, hoverClass }) => (
                <button
                  key={demoUser}
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickLogin(demoUser, demoPassword)}
                  className={`p-2.5 min-h-[44px] text-left rounded-lg border border-slate-200 bg-slate-50 ${hoverClass} transition-all touch-manipulation cursor-pointer shadow-2xs disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <span className="block text-xs font-bold text-black">{role}</span>
                  <span className="block text-[10px] text-slate-700 font-mono font-semibold">{demoUser}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 text-center">
          <p className="text-[11px] text-slate-500">
            Institute Internal System • No public student registration
          </p>
        </div>
      </div>
    </div>
  );
}
