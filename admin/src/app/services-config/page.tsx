'use client';

import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  Layers, 
  ToggleLeft, 
  ToggleRight, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Car,
  Bike,
  Package,
  Compass,
  Plane,
  Truck,
  Bus
} from 'lucide-react';
import { api } from '@/lib/api';

const SERVICE_ICONS: Record<string, any> = {
  ride_boda: Bike,
  ride_economy: Car,
  ride_comfort: Car,
  safari_tour: Compass,
  package_delivery: Package,
  airport_transfer: Plane,
  car_hire: Truck,
};

export default function ServicesConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [services, setServices] = useState<any[]>([]);
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  const loadConfig = async () => {
    setLoading(true);
    try {
      const config = await api.getConfig();
      if (config) {
        setServices(config.services || []);
        setFeatures(config.features || {});
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load configuration', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleToggleService = (serviceId: string) => {
    setServices(prev =>
      prev.map(s => s.id === serviceId ? { ...s, enabled: !s.enabled } : s)
    );
  };

  const handleServiceChange = (serviceId: string, field: string, value: any) => {
    setServices(prev =>
      prev.map(s => s.id === serviceId ? { ...s, [field]: value } : s)
    );
  };

  const handleToggleFeature = (key: string) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await Promise.all([
        api.updateServices(services),
        api.updateFeatures(features),
      ]);
      setMessage({ text: 'Service configuration and feature flags successfully published!', type: 'success' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ text: `Save failed: ${err.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Sliders className="w-7 h-7 text-white" />
            App Services & Feature Toggles
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Activate or suspend mobile services and toggle real-time system capabilities on the fly.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadConfig}
            disabled={loading || saving}
            className="flex items-center gap-2 px-3 py-2 text-xs border border-white/20 rounded-md hover:bg-white/10 text-white/80 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Discard Changes
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-white text-black rounded-md hover:bg-white/90 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Publishing...' : 'Publish to Live App'}
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

      {/* Services Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-white/60" />
            Mobile App Service Modules ({services.length})
          </h2>
          <span className="text-xs text-white/40">
            {services.filter(s => s.enabled).length} of {services.length} active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {services.map((srv) => {
            const IconComponent = SERVICE_ICONS[srv.id] || Layers;
            return (
              <div
                key={srv.id}
                className={`border rounded-xl p-5 transition-all flex flex-col justify-between ${
                  srv.enabled 
                    ? 'border-white/20 bg-white/[0.02] hover:border-white/40' 
                    : 'border-white/10 opacity-50 bg-black'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg border border-white/20 flex items-center justify-center bg-white/[0.04]">
                      <IconComponent className="w-5 h-5 text-white" />
                    </div>
                    <button
                      onClick={() => handleToggleService(srv.id)}
                      className="text-white hover:text-white/80 transition-colors"
                    >
                      {srv.enabled ? (
                        <ToggleRight className="w-8 h-8 text-white" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-white/30" />
                      )}
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] uppercase font-mono tracking-wider text-white/40">Display Title</label>
                      <input
                        type="text"
                        value={srv.title || ''}
                        onChange={e => handleServiceChange(srv.id, 'title', e.target.value)}
                        className="w-full mt-1 bg-black border border-white/15 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-mono tracking-wider text-white/40">Subtitle / Tagline</label>
                      <input
                        type="text"
                        value={srv.subtitle || ''}
                        onChange={e => handleServiceChange(srv.id, 'subtitle', e.target.value)}
                        className="w-full mt-1 bg-black border border-white/15 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase font-mono tracking-wider text-white/40">Service ID</label>
                        <p className="font-mono text-xs text-white/60 mt-1">{srv.id}</p>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-mono tracking-wider text-white/40">Sort Order</label>
                        <input
                          type="number"
                          value={srv.order ?? 0}
                          onChange={e => handleServiceChange(srv.id, 'order', parseInt(e.target.value) || 0)}
                          className="w-full mt-1 bg-black border border-white/15 rounded-md px-3 py-1 text-xs text-white focus:outline-none focus:border-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px]">
                  <span className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase ${
                    srv.enabled ? 'bg-white text-black font-semibold' : 'text-white/40 border border-white/20'
                  }`}>
                    {srv.enabled ? 'Available in App' : 'Suspended'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feature Flags */}
      <div className="space-y-4 pt-6 border-t border-white/10">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Sliders className="w-4 h-4 text-white/60" />
          Global Mobile Feature Switches
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { key: 'enableBoda', label: 'Boda Motorcycle Rides', desc: 'Allow booking of two-wheeler motorbike rides' },
            { key: 'enableSafariBookings', label: 'Tourism & Safaris Hub', desc: 'Enable safari package discovery & guide booking' },
            { key: 'enablePackageDelivery', label: 'Door-to-Door Delivery', desc: 'Allow package dispatch and live parcel tracking' },
            { key: 'enableAirportTransfer', label: 'Entebbe Airport Transfers', desc: 'Scheduled pickups and dropoffs to EBB Airport' },
            { key: 'enablePromotions', label: 'Promotional Banners & Codes', desc: 'Show promo carousels and discount vouchers' },
            { key: 'enableLiveTracking', label: 'WebSocket Driver Telemetry', desc: 'Stream live driver GPS coordinates to passenger map' },
            { key: 'enableInAppWallet', label: 'In-App Stored Wallet', desc: 'Allow passengers to top up balance for rides' },
          ].map((item) => {
            const isEnabled = features[item.key] ?? false;
            return (
              <div
                key={item.key}
                onClick={() => handleToggleFeature(item.key)}
                className={`p-4 border rounded-xl cursor-pointer transition-colors flex items-start justify-between gap-4 ${
                  isEnabled ? 'border-white/30 bg-white/[0.03]' : 'border-white/10 bg-black opacity-60'
                }`}
              >
                <div>
                  <h4 className="text-xs font-bold text-white">{item.label}</h4>
                  <p className="text-[11px] text-white/50 mt-1 leading-relaxed">{item.desc}</p>
                  <p className="text-[10px] font-mono text-white/30 mt-2">{item.key}</p>
                </div>
                <div>
                  {isEnabled ? (
                    <ToggleRight className="w-6 h-6 text-white" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-white/30" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
