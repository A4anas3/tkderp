import React, { useState, useEffect } from 'react';
import { Award, Plus, Edit2, CheckCircle2, ShieldCheck, Users } from 'lucide-react';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { greenCardApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function GreenCardPage() {
  const { success, error } = useToast();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: 'Green Card - All Access Annual Pass',
    price: '15000.00',
    validity_days: 365,
    description: 'Unlimited access to all active batches and subjects for 1 academic year',
    is_active: true,
  });

  const loadCards = async () => {
    setLoading(true);
    try {
      const res = await greenCardApi.list();
      setCards(res || []);
    } catch (err) {
      error(err.message || 'Failed to load Green Card configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, []);

  const handleOpenAdd = () => {
    setEditingCard(null);
    setFormData({
      name: 'Green Card - All Access Annual Pass',
      price: '15000.00',
      validity_days: 365,
      description: 'Unlimited access to all active batches and subjects for 1 academic year',
      is_active: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (c) => {
    setEditingCard(c);
    setFormData({
      name: c.name,
      price: Number(c.price).toFixed(2),
      validity_days: c.validity_days,
      description: c.description || '',
      is_active: c.is_active,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      error('Product name is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        price: parseFloat(formData.price) || 0,
        validity_days: parseInt(formData.validity_days) || 365,
        description: formData.description.trim() || null,
        is_active: formData.is_active,
      };

      if (editingCard) {
        await greenCardApi.update(editingCard.id, payload);
        success(`Green Card product updated: ${formData.name}`);
      } else {
        const res = await greenCardApi.create(payload);
        success(`Green Card product created: ${res.name}`);
      }

      setModalOpen(false);
      loadCards();
    } catch (err) {
      error(err.message || 'Failed to save Green Card');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">
            Green Card — All-Access Pass Product
          </h1>
          <p className="text-xs text-slate-500">
            Special purchasable institutional product granting unlimited access to all eligible active batches
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={handleOpenAdd}>
          Create Green Card Tier
        </Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading Green Card plans...</div>
      ) : cards.length === 0 ? (
        <div className="p-8 bg-white border border-slate-200 rounded-lg text-center space-y-3">
          <Award className="w-10 h-10 text-purple-600 mx-auto" />
          <p className="text-sm font-bold text-black">No Green Card Product Configured</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Configure the All-Access Green Card product to allow students to purchase universal access to all batches.
          </p>
          <Button variant="primary" onClick={handleOpenAdd}>
            Create Initial Green Card Product
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c) => (
            <div
              key={c.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-700 border border-purple-200">
                    <Award className="w-6 h-6" />
                  </div>
                  <Badge variant={c.is_active ? 'purple' : 'neutral'}>
                    {c.is_active ? 'Active Membership' : 'Inactive'}
                  </Badge>
                </div>

                <h2 className="text-base font-bold text-black mt-3">{c.name}</h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {c.description || 'All-access coaching pass'}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Membership Fee:</span>
                    <span className="font-mono text-xl font-black text-black">
                      ₹{Number(c.price).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Validity Duration:</span>
                    <span className="font-bold text-black">{c.validity_days} Days (1 Year)</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Access Scope:</span>
                    <span className="font-semibold text-indigo-700">All Active Batches</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-200 flex justify-end">
                <Button
                  size="xs"
                  variant="secondary"
                  icon={Edit2}
                  onClick={() => handleOpenEdit(c)}
                >
                  Edit Pricing & Rules
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCard ? 'Edit Green Card Product' : 'Create Green Card Product'}
        subtitle="Configure all-access pass pricing, validity days, and eligibility rules"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Product Title"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Green Card - All Access Annual Pass"
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Product Price (₹)"
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              required
            />
            <Input
              label="Validity Duration (Days)"
              type="number"
              min="1"
              value={formData.validity_days}
              onChange={(e) => setFormData({ ...formData, validity_days: e.target.value })}
              required
            />
          </div>

          <Input
            label="Plan Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="e.g. Access all subjects and batches"
          />

          <label className="flex items-center gap-2 text-xs font-semibold text-black cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Active Product (Available for purchase in Admissions)</span>
          </label>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {editingCard ? 'Save Changes' : 'Create Product'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
