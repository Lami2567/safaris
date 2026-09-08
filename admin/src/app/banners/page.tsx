'use client';

import React, { useState, useEffect } from 'react';
import { 
  Megaphone, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  X,
  ExternalLink,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { api } from '@/lib/api';
import { ImagePlaceholder } from '@/components/ImagePlaceholder';

export default function BannersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [banners, setBanners] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedBanner, setSelectedBanner] = useState<any>(null);

  const [bannerForm, setBannerForm] = useState({
    id: '',
    title: '',
    subtitle: '',
    imageUrl: '',
    actionType: 'screen',
    actionValue: 'tourism',
    active: true,
  });

  const loadBanners = async () => {
    setLoading(true);
    try {
      const config = await api.getConfig();
      if (config && config.banners) {
        setBanners(config.banners);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load banners', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBanners();
  }, []);

  const handleOpenCreate = () => {
    setModalMode('create');
    setSelectedBanner(null);
    setBannerForm({
      id: `banner_${Date.now()}`,
      title: '',
      subtitle: '',
      imageUrl: '',
      actionType: 'screen',
      actionValue: 'tourism',
      active: true,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (banner: any) => {
    setModalMode('edit');
    setSelectedBanner(banner);
    setBannerForm({ ...banner });
    setShowModal(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (modalMode === 'create') {
      setBanners(prev => [...prev, bannerForm]);
    } else {
      setBanners(prev => prev.map(b => b.id === bannerForm.id ? bannerForm : b));
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Remove this promotional banner from the mobile app?')) return;
    setBanners(prev => prev.filter(b => b.id !== id));
  };

  const handleToggleActive = (id: string) => {
    setBanners(prev => prev.map(b => b.id === id ? { ...b, active: !b.active } : b));
  };

  const handlePublish = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.updateBanners(banners);
      setMessage({ text: 'Promotional banners published successfully to all mobile clients!', type: 'success' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ text: `Failed to publish: ${err.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Megaphone className="w-7 h-7 text-white" />
            Promotions & Mobile Banners
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Manage top carousel banners, seasonal safari discounts, and click-through deep links.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadBanners}
            disabled={loading || saving}
            className="flex items-center gap-2 px-3 py-2 text-xs border border-white/20 rounded-md hover:bg-white/10 text-white/80 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Reset
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 text-xs border border-white/30 rounded-md hover:bg-white/10 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Banner
          </button>
          <button
            onClick={handlePublish}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-white text-black rounded-md hover:bg-white/90 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Publishing...' : 'Save & Publish'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-xs font-mono border ${
          message.type === 'success' 
            ? 'bg-white text-black border-white' 
            : 'border-red-500/30 bg-red-500/10 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Banners List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {banners.map((banner) => (
          <div
            key={banner.id}
            className={`border rounded-xl p-5 transition-all flex flex-col justify-between ${
              banner.active 
                ? 'border-white/20 bg-white/[0.02] hover:border-white/40' 
                : 'border-white/10 opacity-50 bg-black'
            }`}
          >
            <div>
              <div className="mb-4">
                <ImagePlaceholder
                  label="Carousel Banner Asset"
                  aspectRatio="banner"
                  value={banner.imageUrl}
                />
              </div>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white">{banner.title || 'Untitled Banner'}</h3>
                  <p className="text-xs text-white/60 mt-1">{banner.subtitle || 'No subtitle specified'}</p>
                </div>
                <button
                  onClick={() => handleToggleActive(banner.id)}
                  className="text-white hover:text-white/80"
                >
                  {banner.active ? (
                    <ToggleRight className="w-7 h-7 text-white" />
                  ) : (
                    <ToggleLeft className="w-7 h-7 text-white/30" />
                  )}
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono">
                <span className="text-white/40 uppercase text-[10px]">Deep Link:</span>
                <span className="text-white/80 flex items-center gap-1.5">
                  <ExternalLink className="w-3 h-3 text-white/50" />
                  {banner.actionType || 'screen'}: {banner.actionValue || 'tourism'}
                </span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase ${
                banner.active ? 'bg-white text-black font-semibold' : 'border border-white/20 text-white/40'
              }`}>
                {banner.active ? 'Active on Carousel' : 'Hidden'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEdit(banner)}
                  className="p-2 border border-white/15 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(banner.id)}
                  className="p-2 border border-white/15 rounded-md hover:border-red-500/50 hover:bg-red-500/10 text-white/70 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {banners.length === 0 && !loading && (
        <div className="text-center py-20 border border-dashed border-white/15 rounded-xl">
          <Megaphone className="w-10 h-10 text-white/30 mx-auto mb-3" />
          <p className="text-sm text-white/60">No promotional banners active.</p>
          <button
            onClick={handleOpenCreate}
            className="mt-4 px-4 py-2 bg-white text-black text-xs font-semibold rounded-md hover:bg-white/90"
          >
            Create First Banner
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-black border border-white/20 rounded-xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'create' ? 'Create' : 'Edit'} Promo Banner
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-white/40 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4">
              <ImagePlaceholder
                label="Banner Visual (Flexible placeholder ready)"
                aspectRatio="banner"
                value={bannerForm.imageUrl}
                onChange={(val) => setBannerForm(prev => ({ ...prev, imageUrl: val }))}
              />

              <div>
                <label className="text-xs text-white/60 uppercase font-mono">Banner Headline</label>
                <input
                  type="text"
                  required
                  value={bannerForm.title}
                  onChange={e => setBannerForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. 15% Off Bwindi Gorilla Safaris"
                  className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="text-xs text-white/60 uppercase font-mono">Subtitle / Promo Terms</label>
                <input
                  type="text"
                  value={bannerForm.subtitle}
                  onChange={e => setBannerForm(prev => ({ ...prev, subtitle: e.target.value }))}
                  placeholder="e.g. Valid this weekend only. Code: GORILLA15"
                  className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/60 uppercase font-mono">Action Type</label>
                  <select
                    value={bannerForm.actionType}
                    onChange={e => setBannerForm(prev => ({ ...prev, actionType: e.target.value }))}
                    className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                  >
                    <option value="screen">App Screen</option>
                    <option value="package">Specific Package</option>
                    <option value="external_url">External Web Link</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/60 uppercase font-mono">Target Target / URI</label>
                  <input
                    type="text"
                    value={bannerForm.actionValue}
                    onChange={e => setBannerForm(prev => ({ ...prev, actionValue: e.target.value }))}
                    placeholder="tourism / bwd_01 / https://..."
                    className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="bannerActive"
                  checked={bannerForm.active}
                  onChange={e => setBannerForm(prev => ({ ...prev, active: e.target.checked }))}
                  className="rounded border-white/20 bg-black text-white focus:ring-0"
                />
                <label htmlFor="bannerActive" className="text-xs text-white/80 font-medium cursor-pointer">
                  Activate banner immediately on customer home screen
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-white/20 rounded-md text-xs text-white/70 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-white text-black font-semibold rounded-md text-xs hover:bg-white/90"
                >
                  Apply Banner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
