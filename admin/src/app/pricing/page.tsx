'use client';

import React, { useState, useEffect } from 'react';
import { 
  BadgeDollarSign, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Bike,
  Car,
  Compass,
  Package,
  ShieldCheck
} from 'lucide-react';
import { api } from '@/lib/api';

const VEHICLE_CONFIGS = [
  { key: 'boda', label: 'Boda Motorcycle', icon: Bike, desc: 'Quick 2-wheeler commute across Kampala' },
  { key: 'economy', label: 'Economy Hatchback', icon: Car, desc: 'Affordable everyday urban rides' },
  { key: 'comfort', label: 'Comfort Sedan', icon: Car, desc: 'AC executive transport' },
  { key: 'safari_4x4', label: 'Safari 4x4 Land Cruiser', icon: Compass, desc: 'Off-road pop-up safari vehicle' },
  { key: 'delivery', label: 'Express Parcel Courier', icon: Package, desc: 'Motorcycle / van door delivery' },
];

export default function PricingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [pricing, setPricing] = useState<Record<string, any>>({});

  const loadPricing = async () => {
    setLoading(true);
    try {
      const data = await api.getPricing();
      setPricing(data || {});
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load pricing matrix', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPricing();
  }, []);

  const handleChange = (vehicleKey: string, field: string, value: number) => {
    setPricing(prev => ({
      ...prev,
      [vehicleKey]: {
        ...(prev[vehicleKey] || {}),
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.updatePricing(pricing);
      setMessage({ text: 'Dynamic fare pricing matrix successfully updated!', type: 'success' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ text: `Failed to save pricing: ${err.message}`, type: 'error' });
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
            <BadgeDollarSign className="w-7 h-7 text-white" />
            Fare Matrix & Pricing Engine
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Configure real-time algorithmic fare calculations for rides, 4x4 safaris, and courier deliveries.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadPricing}
            disabled={loading || saving}
            className="flex items-center gap-2 px-3 py-2 text-xs border border-white/20 rounded-md hover:bg-white/10 text-white/80 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Discard
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-white text-black rounded-md hover:bg-white/90 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Updating Matrix...' : 'Save Matrix'}
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

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {VEHICLE_CONFIGS.map((veh) => {
          const IconComponent = veh.icon;
          const current = pricing[veh.key] || {
            baseFare: 2000,
            perKmRate: 1000,
            perMinuteRate: 150,
            minimumFare: 3000,
            cancellationFee: 1500,
          };

          return (
            <div
              key={veh.key}
              className="border border-white/15 rounded-xl p-5 bg-black hover:border-white/30 transition-colors flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg border border-white/20 flex items-center justify-center bg-white/[0.04]">
                    <IconComponent className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{veh.label}</h3>
                    <p className="text-[11px] text-white/50">{veh.desc}</p>
                  </div>
                </div>

                <div className="space-y-3 mt-5">
                  <div>
                    <label className="text-[10px] uppercase font-mono tracking-wider text-white/40">
                      Base Fare (UGX)
                    </label>
                    <input
                      type="number"
                      step="500"
                      value={current.baseFare ?? 0}
                      onChange={e => handleChange(veh.key, 'baseFare', parseInt(e.target.value) || 0)}
                      className="w-full mt-1 bg-black border border-white/15 rounded-md px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-mono tracking-wider text-white/40">
                        Per Km (UGX)
                      </label>
                      <input
                        type="number"
                        step="100"
                        value={current.perKmRate ?? 0}
                        onChange={e => handleChange(veh.key, 'perKmRate', parseInt(e.target.value) || 0)}
                        className="w-full mt-1 bg-black border border-white/15 rounded-md px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-mono tracking-wider text-white/40">
                        Per Minute (UGX)
                      </label>
                      <input
                        type="number"
                        step="50"
                        value={current.perMinuteRate ?? 0}
                        onChange={e => handleChange(veh.key, 'perMinuteRate', parseInt(e.target.value) || 0)}
                        className="w-full mt-1 bg-black border border-white/15 rounded-md px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-mono tracking-wider text-white/40">
                        Min Fare (UGX)
                      </label>
                      <input
                        type="number"
                        step="500"
                        value={current.minimumFare ?? 0}
                        onChange={e => handleChange(veh.key, 'minimumFare', parseInt(e.target.value) || 0)}
                        className="w-full mt-1 bg-black border border-white/15 rounded-md px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-mono tracking-wider text-white/40">
                        Cancel Fee (UGX)
                      </label>
                      <input
                        type="number"
                        step="500"
                        value={current.cancellationFee ?? 0}
                        onChange={e => handleChange(veh.key, 'cancellationFee', parseInt(e.target.value) || 0)}
                        className="w-full mt-1 bg-black border border-white/15 rounded-md px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-white/50 font-mono">
                <span>Formula: Base + (Km × rate) + (Min × rate)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
