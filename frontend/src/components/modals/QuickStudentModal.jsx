import React, { useState } from 'react';
import { Camera, Upload, CheckCircle2, X } from 'lucide-react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Button from '../common/Button';
import Avatar from '../common/Avatar';
import { studentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { compressImage } from '../../utils/imageCompressor';

export default function QuickStudentModal({ isOpen, onClose, onSuccess }) {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoSizeKb, setPhotoSizeKb] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    father_name: '',
    email: '',
    address: '',
    dob: '',
    notes: '',
  });

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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
    if (!formData.name.trim()) {
      error('Student name is required');
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
        mobile: formData.mobile.trim() || null,
        father_name: formData.father_name.trim() || null,
        email: formData.email.trim() || null,
        photo_url: uploadedPhotoUrl,
        address: formData.address.trim() || null,
        dob: formData.dob || null,
        notes: formData.notes.trim() || null,
      };

      const res = await studentApi.create(payload);
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
      handleRemovePhoto();
      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err) {
      error(err.message || 'Failed to register student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quick Student Registration"
      subtitle="Register student record with profile photo compressed to < 20 KB"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
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
              <label className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-white border border-indigo-300 rounded cursor-pointer hover:bg-indigo-50 shadow-2xs transition">
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
          <Input
            label="Mobile Number (Optional)"
            name="mobile"
            type="tel"
            value={formData.mobile}
            onChange={handleChange}
            placeholder="10-digit mobile"
          />
          <Input
            label="Father's Name (Optional)"
            name="father_name"
            value={formData.father_name}
            onChange={handleChange}
            placeholder="Father's Name"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Email Address (Optional)"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Optional email"
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

        <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            Register Student
          </Button>
        </div>
      </form>
    </Modal>
  );
}
