import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, LogIn, KeyRound, UserCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('ADM001');
  const [password, setPassword] = useState('Admin@1234');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    if (!username.trim() || !password) {
      setErrorMessage('Please enter both Employee ID and Password.');
      return;
    }

    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      setErrorMessage(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (u, p) => {
    setUsername(u);
    setPassword(p);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Header - Odoo ERP brand styling */}
        <div className="bg-gradient-to-r from-odoo-700 via-odoo-600 to-odoo-800 p-6 text-white text-center">
          <div className="w-12 h-12 bg-white text-odoo-700 font-black text-2xl rounded-xl mx-auto flex items-center justify-center shadow-md mb-2">
            T
          </div>
          <h1 className="text-xl font-bold tracking-tight">THAKURDWARA COACHING</h1>
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
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Fast One-Click Demo Access
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill('ADM001', 'Admin@1234')}
                className="p-2 text-left rounded-md border border-slate-200 bg-slate-50 hover:bg-purple-50 hover:border-odoo-300 transition"
              >
                <span className="block text-xs font-bold text-black">Admin</span>
                <span className="block text-[10px] text-slate-500 font-mono">ADM001</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('CSH001', 'Cashier@1234')}
                className="p-2 text-left rounded-md border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 transition"
              >
                <span className="block text-xs font-bold text-black">Cashier</span>
                <span className="block text-[10px] text-slate-500 font-mono">CSH001</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('TCH001', 'Teacher@1234')}
                className="p-2 text-left rounded-md border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 transition"
              >
                <span className="block text-xs font-bold text-black">Teacher</span>
                <span className="block text-[10px] text-slate-500 font-mono">TCH001</span>
              </button>
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
