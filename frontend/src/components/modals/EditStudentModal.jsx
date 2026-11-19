import React, { useState, useEffect } from 'react';
import { Camera, CheckCircle2, X, Edit3 } from 'lucide-react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Button from '../common/Button';
import Avatar from '../common/Avatar';
import { studentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { compressImage } from '../../utils/imageCompressor';

export default function EditStudentModal({ isOpen, onClose, student, onSuccess }) {
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
    registration_date: '',
    status: 'ACTIVE',
    notes: '',
  });

  useEffect(() => {
    if (student) {
      setFormData({
        name: student.name || '',
        mobile: student.mobile || '',
        father_name: student.father_name || '',
        email: student.email || '',
        address: student.address || '',
        dob: student.dob || '',
        registration_date: student.registration_date || '',
        status: student.status || 'ACTIVE',
        notes: student.notes || '',
      });
      setPhotoPreview(student.photo_url || null);
      setPhotoFile(null);
      setPhotoSizeKb(null);
    }
  }, [student, isOpen]);

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
      success(`Photo compressed to ${result.sizeKb} KB (under 20 KB limit)`);
    } catch (err) {
      error(err.message || 'Failed to process photo');
    } finally {
      setCompressing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      error('Student name is required');
      return;
    }

    setLoading(true);
    try {
      let finalPhotoUrl = student?.photo_url || null;

      // If photo was changed, upload it
      if (photoFile && student?.id) {
        try {
          const photoRes = await studentApi.uploadPhoto(student.id, photoFile);
          finalPhotoUrl = photoRes.photo_url;
        } catch (uploadErr) {
          console.warn('Photo upload warning:', uploadErr);
        }
      }

      const payload = {
        name: formData.name.trim(),
        mobile: formData.mobile.trim() || null,
        father_name: formData.father_name.trim() || null,
        email: formData.email.trim() || null,
        address: formData.address.trim() || null,
        dob: formData.dob || null,
        registration_date: formData.registration_date || null,
        status: formData.status,
        notes: formData.notes.trim() || null,
        photo_url: finalPhotoUrl,
      };

      const res = await studentApi.update(student.id, payload);
      success(`Student ${res.name} (${res.student_code}) updated successfully`);
      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err) {
      error(err.message || 'Failed to update student');
    } finally {
      setLoading(false);
    }
  };

  if (!student) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Student Information"
      subtitle={`Update student profile details for ${student.name} (${student.student_code})`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Photo Upload Section */}
        <div className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <Avatar
            src={photoPreview}
            name={formData.name || 'Student'}
            size="lg"
            status={formData.status}
          />
          <div className="flex-1 space-y-1">
            <span className="text-xs font-bold text-black block">Profile Photograph</span>
            <p className="text-[11px] text-slate-500">
              Auto-compressed to under 20 KB. Allowed formats: JPG, PNG, WEBP.
            </p>
            {photoSizeKb && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" /> Size: {photoSizeKb} KB
              </span>
            )}
            <div className="flex items-center gap-2 pt-1">
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs transition">
                <Camera className="w-3.5 h-3.5 text-indigo-700" />
                {compressing ? 'Compressing...' : 'Change Photo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  disabled={compressing}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Form Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Full Name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Rahul Sharma"
            required
          />

          <Input
            label="Father's / Guardian Name"
            name="father_name"
            value={formData.father_name}
            onChange={handleChange}
            placeholder="e.g. Suresh Sharma"
          />

          <Input
            label="Mobile Contact"
            name="mobile"
            type="tel"
            value={formData.mobile}
            onChange={handleChange}
            placeholder="10-digit mobile number"
            maxLength={10}
          />

          <Input
            label="Email Address"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="student@example.com"
          />

          <Input
            label="Date of Birth"
            name="dob"
            type="date"
            value={formData.dob}
            onChange={handleChange}
          />

          <Input
            label="Registration Date"
            name="registration_date"
            type="date"
            value={formData.registration_date}
            onChange={handleChange}
          />

          <div>
            <label className="block text-xs font-bold text-black mb-1">Account Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-md px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="REVOKED">REVOKED</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <Input
              label="Address / Location"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="e.g. Mohalla Kazi, Thakurdwara"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-black mb-1">Administrative Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={2}
              placeholder="Optional notes or remarks..."
              className="w-full text-xs bg-white border border-slate-300 rounded-md p-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading} icon={Edit3}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
