import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Save,
  Receipt,
  Upload,
  Trash2,
  Image as ImageIcon,
  Lock,
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import InstituteLogo from '../../components/common/InstituteLogo';
import { settingsApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useInstitute } from '../../context/InstituteContext';

export default function SettingsPage() {
  const { success, error } = useToast();
  const { isAdmin } = useAuth();
  const { setInstituteSettings } = useInstitute();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [formData, setFormData] = useState({
    gstin: '09AAACT1234F1Z5',
    gst_rate: '18.00',
    institute_name: 'THAKURDWARA COACHING INSTITUTE',
    address: 'Civil Lines Road, Thakurdwara, UP - 244601',
    phone: '+91 98765 43210',
    email: 'accounts@thakurdwara.edu.in',
    logo_url: null,
    govt_regd_no: '',
    iso_certification: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // Check cache first for instant rendering
      const cached = localStorage.getItem('institute_gst_settings');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setFormData((prev) => ({
            ...prev,
            ...parsed,
            govt_regd_no: parsed.govt_regd_no || '',
            iso_certification: parsed.iso_certification || '',
          }));
        } catch {
          // ignore
        }
      }

      const res = await settingsApi.getInstitute();
      if (res) {
        const nextData = {
          gstin: res.gstin || '09AAACT1234F1Z5',
          gst_rate: res.gst_rate !== undefined ? String(res.gst_rate) : '18.00',
          institute_name: res.institute_name || 'THAKURDWARA COACHING INSTITUTE',
          address: res.address || 'Civil Lines Road, Thakurdwara, UP - 244601',
          phone: res.phone || '+91 98765 43210',
          email: res.email || 'accounts@thakurdwara.edu.in',
          logo_url: res.logo_url || null,
          govt_regd_no: res.govt_regd_no || '',
          iso_certification: res.iso_certification || '',
        };
        setFormData(nextData);
        setInstituteSettings(res);
      }
    } catch (err) {
      console.warn('Failed to load institute settings from server, using local defaults', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogoFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isAdmin) {
      error('Only Administrators can change the institute logo.');
      return;
    }

    setUploadingLogo(true);
    try {
      const res = await settingsApi.uploadLogo(file);
      setFormData((prev) => ({ ...prev, logo_url: res.logo_url || null }));
      setInstituteSettings(res);
      success('Institute logo uploaded and saved!');
    } catch (err) {
      error(err.message || 'Failed to upload institute logo');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    if (!isAdmin) {
      error('Only Administrators can remove the institute logo.');
      return;
    }
    setUploadingLogo(true);
    try {
      const res = await settingsApi.deleteLogo();
      setFormData((prev) => ({ ...prev, logo_url: null }));
      setInstituteSettings(res);
      success('Institute logo removed.');
    } catch (err) {
      error(err.message || 'Failed to remove institute logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.gstin.trim()) {
      error('Please enter a valid GST number (GSTIN)');
      return;
    }
    const rateNum = parseFloat(formData.gst_rate);
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
      error('Please enter a valid GST percentage (0 - 100%)');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        gstin: formData.gstin.trim().toUpperCase(),
        gst_rate: rateNum,
        institute_name: formData.institute_name.trim(),
        address: formData.address.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        govt_regd_no: formData.govt_regd_no.trim(),
        iso_certification: formData.iso_certification.trim(),
      };

      const res = await settingsApi.updateInstitute(payload);
      setInstituteSettings(res);

      setFormData({
        gstin: res.gstin || payload.gstin,
        gst_rate: res.gst_rate !== undefined ? String(res.gst_rate) : String(payload.gst_rate),
        institute_name: res.institute_name || payload.institute_name,
        address: res.address || payload.address,
        phone: res.phone || payload.phone,
        email: res.email || payload.email,
        logo_url: res.logo_url !== undefined ? res.logo_url : formData.logo_url,
        govt_regd_no: res.govt_regd_no || '',
        iso_certification: res.iso_certification || '',
      });

      success('Institute GST & Profile details saved successfully!');
    } catch (err) {
      error(err.message || 'Failed to save institute settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-black tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-odoo-700" />
            <span>Institute & GST Settings</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Configure institute identification, Goods and Services Tax (GSTIN), and default billing rates for fee slips & invoices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success">Saved & Active</Badge>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* GST Configuration Card (Primary) */}
        <div className="bg-white border-2 border-odoo-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-odoo-50 border border-odoo-200 flex items-center justify-center text-odoo-700">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-black">
                  GST Details & Fee Slip Billing Rate
                </h2>
                <p className="text-[11px] text-slate-500">
                  These details are automatically populated whenever GST is enabled on any course slip or invoice voucher.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold bg-odoo-100 text-odoo-800 px-2 py-0.5 rounded">
              GSTIN / TAX
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* GSTIN */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Institute GSTIN (GST Number) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={formData.gstin}
                  onChange={(e) => handleChange('gstin', e.target.value)}
                  placeholder="e.g. 09AAACT1234F1Z5"
                  className="w-full h-10 px-3 font-mono font-bold text-sm tracking-wider uppercase bg-white border border-slate-300 rounded-lg text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-500 shadow-2xs"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                15-character Goods & Services Tax Identification Number (Printed at the top of fee slips when GST is turned ON).
              </p>
            </div>

            {/* GST Percentage */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Default GST Rate (%) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  value={formData.gst_rate}
                  onChange={(e) => handleChange('gst_rate', e.target.value)}
                  placeholder="18.00"
                  className="w-full h-10 px-3 font-mono font-bold text-sm bg-white border border-slate-300 rounded-lg text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-500 shadow-2xs"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                  %
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Percentage added on top of course fee charges when GST toggle is clicked on the invoice/slip (e.g. 18.00%).
              </p>
            </div>
          </div>

          {/* Quick Preview Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
            <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider block">
              Fee Slip Preview Calculation Formula:
            </span>
            <div className="flex flex-wrap items-center gap-2 text-slate-800 font-mono text-[11px]">
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                Course Charges: ₹1,000.00
              </span>
              <span>+</span>
              <span className="bg-odoo-50 text-odoo-900 px-2 py-0.5 rounded border border-odoo-200 font-bold">
                GST ({formData.gst_rate || 0}%): ₹{((1000 * (parseFloat(formData.gst_rate) || 0)) / 100).toFixed(2)}
              </span>
              <span>=</span>
              <span className="bg-emerald-50 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300 font-black">
                Total with GST: ₹{(1000 + (1000 * (parseFloat(formData.gst_rate) || 0)) / 100).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Institute Identity & Address Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-black">
                Institute Identity & Header Details
              </h2>
              <p className="text-[11px] text-slate-500">
                Appears on all printed receipts, invoices, and student verification documents.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Institute Logo Upload (Admin Only) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl bg-white border-2 border-slate-300 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs p-1">
                  <InstituteLogo
                    src={formData.logo_url}
                    alt={formData.institute_name || 'Institute Logo'}
                    className="w-full h-full object-contain"
                    fallback={<ImageIcon className="w-8 h-8 text-slate-400" />}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Institute Official Logo
                    </span>
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-odoo-800">
                      Admin Only
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 max-w-md">
                    Displayed across the app header, sidebar, fee slips, invoices, student ID cards, and public verification portal.
                  </p>
                  {formData.logo_url && (
                    <p className="text-[10px] font-mono text-slate-500 truncate max-w-xs">
                      Active: {formData.logo_url}
                    </p>
                  )}
                </div>
              </div>

              {isAdmin ? (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleLogoFileChange}
                    className="hidden"
                    id="institute-logo-upload"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={Upload}
                    loading={uploadingLogo}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {formData.logo_url ? 'Change Logo' : 'Upload Logo'}
                  </Button>
                  {formData.logo_url && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      icon={Trash2}
                      disabled={uploadingLogo}
                      onClick={handleRemoveLogo}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shrink-0">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Admin access required to change logo</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Institute Legal / Official Name
              </label>
              <input
                type="text"
                required
                value={formData.institute_name}
                onChange={(e) => handleChange('institute_name', e.target.value)}
                placeholder="THAKURDWARA COACHING INSTITUTE"
                className="w-full h-10 px-3 font-semibold text-sm bg-white border border-slate-300 rounded-lg text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Official Campus Address
              </label>
              <input
                type="text"
                required
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Civil Lines Road, Thakurdwara, UP - 244601"
                className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Helpline / Telephone
                </label>
                <input
                  type="text"
                  required
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full h-10 px-3 font-mono text-sm bg-white border border-slate-300 rounded-lg text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Accounts / Support Email
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="accounts@thakurdwara.edu.in"
                  className="w-full h-10 px-3 font-mono text-sm bg-white border border-slate-300 rounded-lg text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Govt. Regd. No <span className="text-[11px] font-normal text-slate-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={formData.govt_regd_no}
                  onChange={(e) => handleChange('govt_regd_no', e.target.value)}
                  placeholder="Optional — leave blank to hide on slips"
                  className="w-full h-10 px-3 font-mono text-sm bg-white border border-slate-300 rounded-lg text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Printed in the receipt and invoice header only when set.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  ISO Certification <span className="text-[11px] font-normal text-slate-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  maxLength={150}
                  value={formData.iso_certification}
                  onChange={(e) => handleChange('iso_certification', e.target.value)}
                  placeholder="Optional — leave blank to hide on slips"
                  className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Printed in the receipt and invoice header only when set.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="submit"
            variant="primary"
            size="md"
            icon={Save}
            loading={saving}
            className="min-w-[180px] shadow-sm font-bold"
          >
            Save Institute & GST Details
          </Button>
        </div>
      </form>
    </div>
  );
}
