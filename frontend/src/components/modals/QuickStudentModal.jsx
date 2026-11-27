import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, CheckCircle2, X, Sparkles, AlertCircle, ExternalLink, Loader2, User, ArrowRight } from 'lucide-react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Button from '../common/Button';
import Avatar from '../common/Avatar';
import { studentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { compressImage } from '../../utils/imageCompressor';
import { cleanMobileInput, isValid10DigitMobile } from '../../utils/phoneUtils';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getEmailValidationError = (email) => {
  const trimmed = (email || '').trim();
  return trimmed && !EMAIL_REGEX.test(trimmed)
    ? 'Please enter a valid email address'
    : null;
};

export default function QuickStudentModal({ isOpen, onClose, onSuccess, initialData = null }) {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoSizeKb, setPhotoSizeKb] = useState(null);
  const [existingStudent, setExistingStudent] = useState(null);
  const [checkingMobile, setCheckingMobile] = useState(false);
  const [mobileTouched, setMobileTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    father_name: '',
    email: '',
    address: '',
    dob: '',
    notes: '',
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: initialData?.name || '',
        mobile: cleanMobileInput(initialData?.mobile || ''),
        father_name: initialData?.father_name || '',
        email: initialData?.email || '',
        address: initialData?.address || '',
        dob: initialData?.dob || '',
        notes: initialData?.notes || '',
      });
      setPhotoFile(null);
      setPhotoPreview(initialData?.photo_url || null);
      setExistingStudent(null);
      setMobileTouched(false);
      setSubmitAttempted(false);
    }
  }, [isOpen, initialData]);

  // Real-time mobile constraint verification (triggers when 10 digits entered)
  useEffect(() => {
    if (!isOpen) {
      setExistingStudent(null);
      setCheckingMobile(false);
      return;
    }

    const clean = cleanMobileInput(formData.mobile);
    if (clean.length !== 10) {
      setExistingStudent(null);
      setCheckingMobile(false);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingMobile(true);
      try {
        const res = await studentApi.checkMobile(clean);
        if (res?.exists && res?.student) {
          setExistingStudent(res.student);
        } else {
          setExistingStudent(null);
        }
      } catch (err) {
        console.warn('Failed to verify mobile uniqueness:', err);
      } finally {
        setCheckingMobile(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.mobile, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'mobile') {
      const clean = cleanMobileInput(value);
      setFormData((prev) => ({ ...prev, mobile: clean }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressing(true);
    try {
      const result = await compressImage(file, 20);
      setPhotoFile(result.file);
      setPhotoPreview(result.previewUrl);
      setPhotoSizeKb(result.sizeKb);
      success(`Photo compressed to ${result.sizeKb} KB (within 20 KB limit)`);
    } catch (err) {
      error(err.message || 'Failed to process photo');
    } finally {
      setCompressing(false);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoSizeKb(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitAttempted(true);

    if (!formData.name.trim()) {
      error('Student name is required');
      return;
    }

    const cleanMobile = cleanMobileInput(formData.mobile);
    if (!isValid10DigitMobile(cleanMobile, true)) {
      error(cleanMobile ? 'Mobile number must be exactly 10 numeric digits' : 'Mobile number is required');
      return;
    }

    if (existingStudent) {
      error(`This phone number is already registered (${existingStudent.name} - ${existingStudent.student_code})`);
      return;
    }

    const emailValidationError = getEmailValidationError(formData.email);
    if (emailValidationError) {
      error(emailValidationError);
      return;
    }

    setLoading(true);
    try {
      let uploadedPhotoUrl = null;
      if (photoFile) {
        try {
          const uploadRes = await studentApi.uploadStandalonePhoto(photoFile);
          uploadedPhotoUrl = uploadRes.photo_url;
        } catch (uploadErr) {
          console.warn('Photo upload warning:', uploadErr);
        }
      }

      const payload = {
        name: formData.name.trim(),
        mobile: cleanMobile,
        father_name: formData.father_name.trim() || null,
        email: formData.email.trim() || null,
        photo_url: uploadedPhotoUrl,
        address: formData.address.trim() || null,
        dob: formData.dob || null,
        notes: formData.notes.trim() || null,
      };

      const res = await studentApi.create(payload, { check_duplicate: true });
      success(`Student registered successfully: ${res.student_code} - ${res.name}`);
      setFormData({
        name: '',
        mobile: '',
        father_name: '',
        email: '',
        address: '',
        dob: '',
        notes: '',
      });
      setExistingStudent(null);
      setMobileTouched(false);
      setSubmitAttempted(false);
      handleRemovePhoto();
      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err) {
      error(err.message || 'Failed to register student');
    } finally {
      setLoading(false);
    }
  };

  const cleanMobile = cleanMobileInput(formData.mobile);
  const mobileError = !cleanMobile
    ? (mobileTouched || submitAttempted ? 'Mobile number is required' : null)
    : !isValid10DigitMobile(cleanMobile, true)
    ? `Must be exactly 10 numeric digits (${cleanMobile.length}/10)`
    : existingStudent
    ? 'This phone number is already registered'
    : null;
  const emailError = getEmailValidationError(formData.email);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Student Admission"
      subtitle="Admit student record with profile photo compressed to < 20 KB"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {initialData?.name && (
          <div className="p-2.5 bg-purple-50 border border-odoo-200 rounded-lg flex items-center gap-2 text-xs text-odoo-900 font-semibold">
            <Sparkles className="w-4 h-4 text-odoo-600 shrink-0" />
            <span>Pre-filled with reusable details from student enquiry</span>
          </div>
        )}
        {/* Profile Image Upload Box */}
        <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
          <Avatar src={photoPreview} name={formData.name || 'Student'} size="lg" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-black block">Student Profile Photo</span>
            <span className="text-[11px] text-slate-500 block">
              Auto-compressed to &le; 20 KB for fast loading
            </span>

            {photoSizeKb ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {photoSizeKb} KB (&le; 20 KB)
                </span>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="text-[10px] text-rose-600 hover:underline flex items-center gap-0.5"
                >
                  <X className="w-3 h-3" /> Remove
                </button>
              </div>
            ) : (
              <label className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-odoo-700 bg-white border border-odoo-300 rounded cursor-pointer hover:bg-purple-50 shadow-2xs transition">
                <Camera className="w-3.5 h-3.5" />
                <span>{compressing ? 'Compressing...' : 'Take / Upload Photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                  disabled={compressing}
                />
              </label>
            )}
          </div>
        </div>

        <Input
          label="Student Full Name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          placeholder="e.g. Rahul Sharma"
          autoFocus
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Input
              label="Mobile Number"
              name="mobile"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              value={formData.mobile}
              onChange={handleChange}
              onBlur={() => setMobileTouched(true)}
              required
              placeholder="10-digit mobile"
              error={mobileError}
              helperText={
                cleanMobile.length === 10 && !existingStudent && !checkingMobile
                  ? '✓ Valid 10-digit mobile'
                  : null
              }
            />
            {checkingMobile && (
              <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                <Loader2 className="w-3 h-3 animate-spin text-odoo-600" />
                Checking mobile constraint...
              </span>
            )}
          </div>
          <Input
            label="Father's Name (Optional)"
            name="father_name"
            value={formData.father_name}
            onChange={handleChange}
            placeholder="Father's Name"
          />
        </div>

        {/* Existing Student Constraint Warning Banner */}
        {existingStudent && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs space-y-2 animate-in fade-in duration-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold text-amber-950 block">
                  This phone number is already registered
                </span>
                <span className="text-amber-900 font-medium block mt-0.5">
                  <strong className="text-black">{existingStudent.name}</strong> • Code:{' '}
                  <strong className="font-mono text-black">{existingStudent.student_code}</strong>
                  {existingStudent.latest_admission_number && (
                    <span className="ml-1 text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300">
                      Admission #{existingStudent.latest_admission_number}
                    </span>
                  )}
                </span>
                {existingStudent.has_admission ? (
                  <span className="text-[11px] text-emerald-800 font-bold block mt-1">
                    ✓ User already has active course admission on file.
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-600 font-medium block mt-1">
                    Student account already exists in database. Ready for admission.
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-amber-200">
              <Button
                type="button"
                size="xs"
                variant="info"
                icon={User}
                onClick={() => {
                  onClose();
                  navigate(`/students/${existingStudent.id}`);
                }}
                title="View student profile in same page"
              >
                View Detail Profile
              </Button>

              {onSuccess ? (
                <Button
                  type="button"
                  size="xs"
                  variant="primary"
                  onClick={() => {
                    onSuccess(existingStudent);
                    onClose();
                  }}
                  title="Select this existing registered student for admission"
                >
                  Use Existing Student ✓
                </Button>
              ) : (
                <Button
                  type="button"
                  size="xs"
                  variant="primary"
                  icon={ArrowRight}
                  onClick={() => {
                    onClose();
                    navigate(`/enrollments/new?student_id=${existingStudent.id}`);
                  }}
                  title="Create new enrollment for this registered student"
                >
                  New Enrollment
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Email Address (Optional)"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Optional email"
            error={emailError}
          />
          <Input
            label="Date of Birth (Optional)"
            name="dob"
            type="date"
            value={formData.dob}
            onChange={handleChange}
          />
        </div>

        <Input
          label="Residential Address (Optional)"
          name="address"
          value={formData.address}
          onChange={handleChange}
          placeholder="Area, City, Landmark"
        />

        <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} disabled={loading} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={loading || !!existingStudent}
            className="w-full sm:w-auto"
            title={
              existingStudent
                ? 'Mobile number already registered'
                : 'Register new student'
            }
          >
            {existingStudent ? 'Mobile Already Registered' : 'Confirm Admission'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
