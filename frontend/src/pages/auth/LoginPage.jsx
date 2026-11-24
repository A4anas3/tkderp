import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInstitute } from '../../context/InstituteContext';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import InstituteLogo from '../../components/common/InstituteLogo';

export default function LoginPage() {
  const { login } = useAuth();
  const { institute } = useInstitute();
  const instituteName = institute?.institute_name || 'THAKURDWARA COACHING INSTITUTE';
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Header - Odoo ERP brand styling */}
        <div className="bg-gradient-to-r from-odoo-700 via-odoo-600 to-odoo-800 p-6 text-white text-center">
          <div className="w-16 h-16 bg-white text-odoo-700 font-black text-2xl rounded-xl mx-auto flex items-center justify-center shadow-md mb-2.5 overflow-hidden p-1">
            <InstituteLogo
              src={institute?.logo_url}
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
