import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  User,
  Camera,
  X,
  Loader2,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import Avatar from '../common/Avatar';
import { enquiryApi, studentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { compressImage } from '../../utils/imageCompressor';
import { cleanMobileInput } from '../../utils/phoneUtils';
import { formatIndianDate } from '../../utils/dateCycleUtils';

export default function RegisterStudentModal({
  isOpen,
  onClose,
  enquiry,
  resultData,
  onSelectStudent,
  submitting = false,
  standaloneMode = false,
  initialMobile = '',
  initialName = '',
  forceCreateInitial = false,
  onStudentReady,
}) {
  const navigate = useNavigate();
  const { success, error } = useToast();

  // Standalone registration form state (used in register-first demo flow)
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    father_name: '',
    school_college: '',
    email: '',
    dob: '',
    address: '',
    notes: '',
  });
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoSizeKb, setPhotoSizeKb] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [checkingMobile, setCheckingMobile] = useState(false);
  const [mobileCheckResult, setMobileCheckResult] = useState(null);
  const [forceCreate, setForceCreate] = useState(false);
  const [savingStandalone, setSavingStandalone] = useState(false);

  useEffect(() => {
    if (isOpen && standaloneMode) {
      setFormData({
        name: initialName || '',
        mobile: cleanMobileInput(initialMobile || ''),
        father_name: '',
        school_college: '',
        email: '',
        dob: '',
        address: '',
        notes: '',
      });
      setPhotoPreview(null);
      setPhotoFile(null);
      setPhotoSizeKb(null);
      setMobileCheckResult(null);
      setForceCreate(Boolean(forceCreateInitial));
    }
  }, [isOpen, standaloneMode, initialMobile, initialName, forceCreateInitial]);

  // Real-time phone-only duplicate check (last 10 digits, L1 rule)
  useEffect(() => {
    if (!isOpen || !standaloneMode || forceCreate) {
      if (forceCreate) setMobileCheckResult(null);
      setCheckingMobile(false);
      return;
    }

    const clean = cleanMobileInput(formData.mobile);
    if (clean.length !== 10) {
      setMobileCheckResult(null);
      setCheckingMobile(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setCheckingMobile(true);
      try {
        const res = await enquiryApi.checkStudentByMobile(clean);
        if (!cancelled) {
          setMobileCheckResult(res);
        }
      } catch (err) {
        console.warn('Mobile check warning:', err);
      } finally {
        if (!cancelled) setCheckingMobile(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.mobile, isOpen, standaloneMode, forceCreate]);

  if (!isOpen) return null;

  // =========================================================================
  // MODE A: STANDALONE REGISTER-FIRST MODAL (Before Demo Creation)
  // =========================================================================
  if (standaloneMode) {
    const matchedMultiple = !forceCreate && Boolean(mobileCheckResult?.multiple_matches);
    const matchedSingle =
      !forceCreate &&
      Boolean(mobileCheckResult?.exists) &&
      !mobileCheckResult?.multiple_matches &&
      mobileCheckResult?.student;
    const multipleMatchesList = mobileCheckResult?.matches || [];

    const handleFieldChange = (e) => {
      const { name, value } = e.target;
      if (name === 'mobile') {
        const clean = cleanMobileInput(value);
        setForceCreate(false);
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

    const handleUseExistingStudent = (stu) => {
      if (!stu) return;
      success(`Linked existing student ${stu.name} (${stu.student_code})`);
      if (onStudentReady) onStudentReady(stu);
      onClose();
    };

    const handleStandaloneSubmit = async (e, overrideForceCreate = null) => {
      if (e) e.preventDefault();
      const effectiveForceCreate = overrideForceCreate !== null ? overrideForceCreate : forceCreate;

      const cleanMob = cleanMobileInput(formData.mobile);
      if (cleanMob.length !== 10 || !/^\d{10}$/.test(cleanMob)) {
        error('Mobile number must be exactly 10 numeric digits');
        return;
      }

      // If duplicate phone matched a single existing student and user did not force new, link existing!
      if (!effectiveForceCreate && matchedSingle) {
        handleUseExistingStudent(matchedSingle);
        return;
      }

      if (!effectiveForceCreate && matchedMultiple) {
        error('Multiple students share this phone number. Select one below or click "None of these".');
        return;
      }

      if (!formData.name.trim() || formData.name.trim().length < 2) {
        error('Student name must be at least 2 characters');
        return;
      }

      setSavingStandalone(true);
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
          mobile: cleanMob,
          father_name: formData.father_name.trim() || null,
          school_college: formData.school_college.trim() || null,
          email: formData.email.trim() || null,
          dob: formData.dob || null,
          address: formData.address.trim() || null,
          photo_url: uploadedPhotoUrl,
          notes: formData.notes.trim() || null,
          force_create: effectiveForceCreate,
        };

        const res = await enquiryApi.registerStudentStandalone(payload);

        if (res.multiple_matches) {
          setForceCreate(false);
          setMobileCheckResult({
            valid: true,
            exists: true,
            multiple_matches: true,
            normalized_mobile: cleanMob,
            student: null,
            matches: res.matches || [],
          });
          return;
        }

        if (res.already_registered) {
          success(`Already registered with student code ${res.student_code}`);
        } else {
          success(`Student ${res.student_name} (${res.student_code}) registered successfully`);
        }

        if (onStudentReady) {
          onStudentReady({
            id: res.student_id,
            student_code: res.student_code,
            name: res.student_name,
            mobile: res.mobile,
          });
        }
        onClose();
      } catch (err) {
        error(err.message || 'Failed to register student');
      } finally {
        setSavingStandalone(false);
      }
    };

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Register Student Profile First"
        subtitle="Student record must exist in DB before creating a demo trial pass"
        maxWidth={matchedMultiple ? 'max-w-2xl' : 'max-w-lg'}
      >
        <form onSubmit={(e) => handleStandaloneSubmit(e)} className="space-y-3 text-xs">
          {/* Multiple Matching Students Picker (Same L1 UI) */}
          {matchedMultiple ? (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-900 text-xs">
                    Several students ({multipleMatchesList.length}) share this phone number.
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Matches were found on the normalised 10-digit mobile number ({cleanMobileInput(formData.mobile)}).
                    Select the existing profile to give this demo, or create a brand-new profile.
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                <div className="bg-slate-100 px-3 py-2 font-semibold text-slate-700 text-[11px] grid grid-cols-12 gap-2">
                  <span className="col-span-3">Code / ID</span>
                  <span className="col-span-4">Student Name</span>
                  <span className="col-span-3">Father / Mobile</span>
                  <span className="col-span-2 text-right">Action</span>
                </div>

                {multipleMatchesList.map((m) => (
                  <div
                    key={m.id}
                    className="px-3 py-2.5 hover:bg-slate-50 transition flex flex-col sm:grid sm:grid-cols-12 gap-2 items-start sm:items-center text-xs"
                  >
                    <div className="col-span-3">
                      <span className="font-mono font-bold text-odoo-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 block w-fit">
                        {m.student_code}
                      </span>
                      {m.registration_date && (
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Reg: {formatIndianDate(m.registration_date)}
                        </span>
                      )}
                    </div>

                    <div className="col-span-4 font-bold text-black flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{m.name}</span>
                    </div>

                    <div className="col-span-3 text-[11px] text-slate-600">
                      <div className="truncate">{m.father_name || 'N/A'}</div>
                      <div className="font-mono text-slate-500 text-[10px]">{m.mobile || ''}</div>
                    </div>

                    <div className="col-span-2 text-right w-full sm:w-auto">
                      <Button
                        type="button"
                        size="xs"
                        variant="primary"
                        disabled={savingStandalone}
                        onClick={() => handleUseExistingStudent(m)}
                        className="w-full sm:w-auto"
                      >
                        Select
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="secondary" size="xs" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Profile Photo Upload */}
              <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <Avatar src={photoPreview} name={formData.name || 'Student'} size="lg" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-black block">Student Profile Photo (Optional)</span>
                  <span className="text-[11px] text-slate-500 block">
                    Auto-compressed to &le; 20 KB
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
                onChange={handleFieldChange}
                placeholder="e.g. Priyanshu Sharma"
                required={!matchedSingle}
                autoFocus
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Input
                    label="Mobile Number (10 Digits)"
                    name="mobile"
                    type="tel"
                    inputMode="numeric"
                    maxLength={16}
                    value={formData.mobile}
                    onChange={handleFieldChange}
                    placeholder="10-digit mobile"
                    required
                    error={
                      formData.mobile && formData.mobile.length < 10
                        ? `Must be 10 digits (${formData.mobile.length}/10)`
                        : matchedSingle
                        ? 'This phone number is already registered'
                        : null
                    }
                    helperText={
                      formData.mobile.length === 10 && !checkingMobile && !matchedSingle
                        ? '✓ New 10-digit mobile — ready to register'
                        : null
                    }
                  />
                  {checkingMobile && (
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                      <Loader2 className="w-3 h-3 animate-spin text-odoo-600" />
                      Checking phone duplicate...
                    </span>
                  )}
                </div>

                <Input
                  label="Father's Name (Optional)"
                  name="father_name"
                  value={formData.father_name}
                  onChange={handleFieldChange}
                  placeholder="Father's Name"
                />
              </div>

              {/* Single Existing Match Banner (Duplicate Check on Phone Only) */}
              {matchedSingle && (
                <div className="p-3 bg-blue-50 border border-blue-300 rounded-lg space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="font-bold text-blue-950 block">
                        This phone number is already registered ({matchedSingle.student_code})
                      </span>
                      <span className="text-[11px] text-blue-800 block mt-0.5">
                        Existing student <strong>{matchedSingle.name}</strong> matched on normalised 10-digit phone ({matchedSingle.mobile}).
                        No duplicate student will be created — proceeding will link the demo to this profile.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-blue-200">
                    <Button
                      type="button"
                      size="xs"
                      variant="primary"
                      icon={ArrowRight}
                      onClick={() => handleUseExistingStudent(matchedSingle)}
                    >
                      Use Existing Student & Continue
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="School / College (Optional)"
                  name="school_college"
                  value={formData.school_college}
                  onChange={handleFieldChange}
                  placeholder="e.g. Delhi Public School"
                />
                <Input
                  label="Email Address (Optional)"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleFieldChange}
                  placeholder="Optional email"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Date of Birth (Optional)"
                  name="dob"
                  type="date"
                  value={formData.dob}
                  onChange={handleFieldChange}
                />
                <Input
                  label="Residential Address (Optional)"
                  name="address"
                  value={formData.address}
                  onChange={handleFieldChange}
                  placeholder="Area, City, Landmark"
                />
              </div>

              <Input
                label="Notes (Optional)"
                name="notes"
                value={formData.notes}
                onChange={handleFieldChange}
                placeholder="Additional profile notes"
              />

              <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onClose}
                  disabled={savingStandalone}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={savingStandalone}
                  disabled={savingStandalone || checkingMobile || formData.mobile.length !== 10}
                  className="w-full sm:w-auto"
                >
                  {matchedSingle
                    ? `Use Existing (${matchedSingle.student_code}) & Continue`
                    : 'Register Student & Continue'}
                </Button>
              </div>
            </>
          )}
        </form>
      </Modal>
    );
  }

  // =========================================================================
  // MODE B: EXISTING ENQUIRY REGISTER STUDENT ACTION RESULT MODAL
  // =========================================================================
  if (!resultData) return null;

  const isMultipleMatches = Boolean(resultData.multiple_matches);
  const isAlreadyRegistered = Boolean(resultData.already_registered);
  const matches = resultData.matches || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isMultipleMatches
          ? 'Multiple Matching Students Found'
          : isAlreadyRegistered
          ? 'Student Already Registered'
          : 'Student Registration Result'
      }
      subtitle={
        enquiry
          ? `Enquiry for ${enquiry.student_name} • Phone: ${enquiry.mobile || 'N/A'}`
          : ''
      }
      maxWidth={isMultipleMatches ? 'max-w-2xl' : 'max-w-lg'}
    >
      <div className="space-y-4 text-xs">
        {/* CASE 1: Multiple Students Found matching this phone number */}
        {isMultipleMatches && (
          <div className="space-y-3">
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 text-xs">
                  Several students ({matches.length}) share this phone number.
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Matches were found on the normalised 10-digit mobile number ({enquiry?.mobile}).
                  Please pick the existing profile to link this enquiry to, or create a brand-new profile.
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
              <div className="bg-slate-100 px-3 py-2 font-semibold text-slate-700 text-[11px] grid grid-cols-12 gap-2">
                <span className="col-span-3">Code / ID</span>
                <span className="col-span-4">Student Name</span>
                <span className="col-span-3">Father / Mobile</span>
                <span className="col-span-2 text-right">Action</span>
              </div>

              {matches.map((m) => (
                <div
                  key={m.id}
                  className="px-3 py-2.5 hover:bg-slate-50 transition flex flex-col sm:grid sm:grid-cols-12 gap-2 items-start sm:items-center text-xs"
                >
                  <div className="col-span-3">
                    <span className="font-mono font-bold text-odoo-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 block w-fit">
                      {m.student_code}
                    </span>
                    {m.registration_date && (
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Reg: {formatIndianDate(m.registration_date)}
                      </span>
                    )}
                  </div>

                  <div className="col-span-4 font-bold text-black flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{m.name}</span>
                  </div>

                  <div className="col-span-3 text-[11px] text-slate-600">
                    <div className="truncate">{m.father_name || 'N/A'}</div>
                    <div className="font-mono text-slate-500 text-[10px]">{m.mobile || ''}</div>
                  </div>

                  <div className="col-span-2 text-right w-full sm:w-auto">
                    <Button
                      size="xs"
                      variant="primary"
                      disabled={submitting}
                      onClick={() => onSelectStudent && onSelectStudent(m.id)}
                      title="Link enquiry to this student profile"
                      className="w-full sm:w-auto"
                    >
                      Select
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* CASE 2: Single Match Found & Linked (Already Registered) */}
        {!isMultipleMatches && isAlreadyRegistered && (
          <div className="space-y-4">
            <div className="p-3.5 bg-blue-50 border border-blue-300 rounded-lg flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-blue-950 text-sm">
                  Already registered with student code {resultData.student_code}
                </h4>
                <p className="text-xs text-blue-800 mt-1">
                  An existing student profile was matched on the normalised 10-digit mobile number ({resultData.mobile || enquiry?.mobile}).
                  No duplicate student was created — this enquiry has been linked to the existing profile.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-semibold uppercase">Student Profile</span>
                <span className="font-mono font-bold text-odoo-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  {resultData.student_code}
                </span>
              </div>
              <div className="text-sm font-bold text-black">
                {resultData.student_name || enquiry?.student_name}
              </div>
              {resultData.mobile && (
                <div className="text-xs text-slate-600 font-mono">
                  Phone: {resultData.mobile}
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={ExternalLink}
                onClick={() => {
                  onClose();
                  if (resultData.student_id) {
                    navigate(`/students/${resultData.student_id}`);
                  }
                }}
              >
                View Existing Profile ↗
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="emerald"
                  size="sm"
                  icon={ArrowRight}
                  onClick={() => {
                    onClose();
                    navigate(
                      `/enrollments/new?enquiry_id=${enquiry.id}&student_id=${resultData.student_id}&name=${encodeURIComponent(
                        resultData.student_name || enquiry.student_name
                      )}&mobile=${encodeURIComponent(resultData.mobile || enquiry.mobile || '')}&auto_register=1`
                    );
                  }}
                >
                  Buy Course ↗
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onClose}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* CASE 3: Brand New Student Created */}
        {!isMultipleMatches && !isAlreadyRegistered && resultData.student_code && (
          <div className="space-y-4">
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-lg flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-emerald-950 text-sm">
                  Student Registered Successfully
                </h4>
                <p className="text-xs text-emerald-800 mt-1">
                  Pre-filled student profile created with code{' '}
                  <span className="font-mono font-bold">{resultData.student_code}</span> and linked to this enquiry.
                  Demo status remains active (not converted until course purchase).
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-semibold uppercase">Student Profile</span>
                <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {resultData.student_code}
                </span>
              </div>
              <div className="text-sm font-bold text-black">
                {resultData.student_name || enquiry?.student_name}
              </div>
              {resultData.mobile && (
                <div className="text-xs text-slate-600 font-mono">
                  Phone: {resultData.mobile}
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={ExternalLink}
                onClick={() => {
                  onClose();
                  if (resultData.student_id) {
                    navigate(`/students/${resultData.student_id}`);
                  }
                }}
              >
                View Student Profile ↗
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="emerald"
                  size="sm"
                  icon={ArrowRight}
                  onClick={() => {
                    onClose();
                    navigate(
                      `/enrollments/new?enquiry_id=${enquiry.id}&student_id=${resultData.student_id}&name=${encodeURIComponent(
                        resultData.student_name || enquiry.student_name
                      )}&mobile=${encodeURIComponent(resultData.mobile || enquiry.mobile || '')}&auto_register=1`
                    );
                  }}
                >
                  Buy Course ↗
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onClose}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
