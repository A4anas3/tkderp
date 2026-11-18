import React, { useState } from 'react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Button from '../common/Button';
import { studentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function QuickStudentModal({ isOpen, onClose, onSuccess }) {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      error('Student name is required');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name.trim(),
        mobile: formData.mobile.trim() || null,
        father_name: formData.father_name.trim() || null,
        email: formData.email.trim() || null,
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
      subtitle="Register student record directly without email requirement"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
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
