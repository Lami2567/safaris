'use client';

import React, { useState, useEffect } from 'react';
import {
  BadgeDollarSign,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Car,
  Plane,
  Package,
  Calculator,
  Plus,
  Trash2,
  Edit3,
  X,
  Compass,
} from 'lucide-react';
import { api } from '@/lib/api';
import { ImageUploader } from '@/components/ImageUploader';

type PricingTab = 'catalogue' | 'ride_hailing' | 'airport_shuttle' | 'express_delivery' | 'simulator';

const SERVICE_OPTIONS = [
  { id: 'ride_hailing', label: 'Ride-Hailing' },
  { id: 'airport_shuttle', label: 'Airport Shuttle' },
  { id: 'tours', label: 'Tours & Safaris' },
  { id: 'express_delivery', label: 'Express Delivery' },
] as const;

const DEFAULT_BANDS = [
  { id: 'b1', label: '0 - 5 km', minKm: 0, maxKm: 5, ratePerKmUgx: 0 },
  { id: 'b2', label: '5 - 15 km', minKm: 5, maxKm: 15, ratePerKmUgx: 0 },
  { id: 'b3', label: '15+ km', minKm: 15, maxKm: null, ratePerKmUgx: 0 },
];

const inputCls = 'w-full mt-1 bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-white';
const labelCls = 'text-[10px] text-white/50 font-mono uppercase';

function emptyVehicle(order: number) {
  return {
    id: '',
    code: '',
    name: '',
    category: 'Sedan / Economy',
    make: '',
    model: '',
    description: '',
    image_url: '',
    icon_name: 'directions_car',
    passenger_capacity: 4,
    luggage_capacity: 2,
    max_weight_kg: 50,
    eta_minutes: 5,
    is_available: true,
    is_active: true,
    display_order: order,
    assigned_services: [] as string[],
    service_pricing: {} as Record<string, any>,
  };
}

function NumField({ label, value, onChange, step = 500 }: { label: string; value: any; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="number"
        step={step}
        value={value ?? 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={inputCls}
      />
    </div>
  );
}

function BandsEditor({ bands, onChange }: { bands: any[]; onChange: (b: any[]) => void }) {
  return (
    <div className="space-y-2 pt-2 border-t border-white/10">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase text-white/60">Distance Bands (km)</span>
        <button
          type="button"
          onClick={() => {
            const last = bands[bands.length - 1];
            const start = last ? Number(last.maxKm ?? Number(last.minKm) + 10) : 0;
            onChange([...bands, { id: `b${Date.now()}`, label: '', minKm: start, maxKm: null, ratePerKmUgx: 0 }]);
          }}
          className="text-[10px] font-mono px-2 py-1 border border-white/20 rounded text-white hover:bg-white/10"
        >
          + Add Band
        </button>
      </div>
      {bands.map((band, i) => (
        <div key={band.id || i} className="grid grid-cols-4 gap-2 items-end bg-white/[0.02] p-2 rounded border border-white/10">
          <NumField label="Min Km" step={0.5} value={band.minKm} onChange={(v) => { const n = [...bands]; n[i] = { ...band, minKm: v }; onChange(n); }} />
          <div>
            <label className={labelCls}>Max Km (blank = ∞)</label>
            <input
              type="number"
              step={0.5}
              value={band.maxKm ?? ''}
              placeholder="∞"
              onChange={(e) => { const n = [...bands]; n[i] = { ...band, maxKm: e.target.value === '' ? null : parseFloat(e.target.value) }; onChange(n); }}
              className={inputCls}
            />
          </div>
          <NumField label="Rate / Km (UGX)" step={100} value={band.ratePerKmUgx} onChange={(v) => { const n = [...bands]; n[i] = { ...band, ratePerKmUgx: v }; onChange(n); }} />
          <div className="flex justify-end">
            <button type="button" onClick={() => onChange(bands.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 px-2 py-1.5">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PricingPage() {
  const [activeTab, setActiveTab] = useState<PricingTab>('catalogue');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [rules, setRules] = useState<Record<string, any>>({});

  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [vehicleForm, setVehicleForm] = useState<any>(emptyVehicle(1));

  const [simForm, setSimForm] = useState({
    serviceType: 'RIDE',
    vehicleId: '',
    distanceKm: 8.5,
    durationMinutes: 20,
    guestCount: 2,
    durationDays: 3,
    routeCode: 'kampala_ebb',
    isRoundTrip: false,
    extraLuggageCount: 0,
    packageCategory: 'DOCUMENTS',
    weightKg: 3,
    destinationId: '',
  });
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [destinations, setDestinations] = useState<any[]>([]);

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4500);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [vehList, rulesMap, dests] = await Promise.all([
        api.getCatalogueVehicles({ includeInactive: true }).catch(() => []),
        api.getServicePricingRules().catch(() => ({})),
        api.getDestinations(false).catch(() => []),
      ]);
      setVehicles(vehList || []);
      setRules(rulesMap || {});
      setDestinations(dests || []);
    } catch (err: any) {
      notify(err.message || 'Failed to load pricing data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const saveVehicle = async (vehicle: any, successMsg: string) => {
    setSaving(true);
    try {
      const payload = { ...vehicle };
      if (!payload.id) delete payload.id;
      await api.upsertCatalogueVehicle(payload);
      notify(successMsg);
      await loadAll();
      return true;
    } catch (err: any) {
      notify(`Save failed: ${err.message}`, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    if (!confirm('Delete this vehicle from the catalogue?')) return;
    try {
      await api.deleteCatalogueVehicle(id);
      notify('Vehicle removed from catalogue.');
      await loadAll();
    } catch (err: any) {
      notify(`Delete failed: ${err.message}`, 'error');
    }
  };

  const toggleService = async (v: any, key: string) => {
    const current: string[] = Array.isArray(v.assigned_services) ? v.assigned_services : [];
    const next = current.includes(key) ? current.filter((s) => s !== key) : [...current, key];
    await saveVehicle({ id: v.id, name: v.name, assigned_services: next }, `${v.name}: service assignments updated`);
  };

  const updateVehiclePricingLocal = (vehicleId: string, serviceKey: string, patch: Record<string, any>) => {
    setVehicles((prev) =>
      prev.map((v) =>
        v.id === vehicleId
          ? {
              ...v,
              service_pricing: {
                ...(v.service_pricing || {}),
                [serviceKey]: { ...(v.service_pricing?.[serviceKey] || {}), ...patch },
              },
            }
          : v
      )
    );
  };

  const saveVehiclePricing = async (v: any, serviceKey: string) => {
    await saveVehicle(
      { id: v.id, name: v.name, service_pricing: { [serviceKey]: v.service_pricing?.[serviceKey] || {} } },
      `${v.name}: ${serviceKey.replace(/_/g, ' ')} pricing saved (version incremented)`
    );
  };

  const saveRule = async (key: string) => {
    setSaving(true);
    try {
      const { pricingVersion, updatedAt, ...config } = rules[key] || {};
      await api.updateServicePricingRule(key, config);
      notify(`${key.replace(/_/g, ' ')} rules saved.`);
      await loadAll();
    } catch (err: any) {
      notify(`Save failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const runSimulator = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimLoading(true);
    try {
      const body: any = { ...simForm };
      if (!body.vehicleId) delete body.vehicleId;
      if (!body.destinationId) delete body.destinationId;
      setSimResult(await api.calculateQuote(body));
    } catch (err: any) {
      setSimResult(null);
      notify(`Quotation error: ${err.message}`, 'error');
    } finally {
      setSimLoading(false);
    }
  };

  const vehiclesFor = (key: string) => vehicles.filter((v) => Array.isArray(v.assigned_services) && v.assigned_services.includes(key));
  const shuttleRoutes: any[] = Array.isArray(rules.airport_shuttle?.routes) ? rules.airport_shuttle.routes : [];
  const categorySurcharges: Record<string, number> = rules.express_delivery?.categorySurchargesUgx || {};

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 min-w-0 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <BadgeDollarSign className="w-7 h-7 text-white" />
            Vehicle Catalogue &amp; Pricing Engine
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Centralized fleet catalogue, explicit service assignments, distance bands, airport routes and delivery pricing. All prices are applied server-side.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadAll}
            disabled={loading || saving}
            className="flex items-center gap-2 px-3 py-2 text-xs border border-white/20 rounded-md hover:bg-white/10 text-white/80"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {activeTab === 'catalogue' && (
            <button
              onClick={() => { setVehicleForm(emptyVehicle(vehicles.length + 1)); setShowVehicleModal(true); }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white text-black rounded-md hover:bg-white/90"
            >
              <Plus className="w-4 h-4" /> Add Vehicle
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-xs font-mono border ${
          message.type === 'success' ? 'bg-white text-black border-white' : 'border-red-500/30 bg-red-500/10 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-white/10 overflow-x-auto">
        {[
          { id: 'catalogue', label: 'Vehicle Catalogue', icon: Car },
          { id: 'ride_hailing', label: 'Ride-Hailing Bands', icon: Compass },
          { id: 'airport_shuttle', label: 'Airport Shuttle', icon: Plane },
          { id: 'express_delivery', label: 'Express Delivery', icon: Package },
          { id: 'simulator', label: 'Quote Simulator', icon: Calculator },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as PricingTab)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 whitespace-nowrap ${
                isActive ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white/80'
              }`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: CATALOGUE */}
      {activeTab === 'catalogue' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-white/15 bg-white/[0.02] text-xs text-white/70">
            A vehicle only appears in the mobile app for the services ticked below. Adding a vehicle does not publish it to every service.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vehicles.map((v) => {
              const assigned: string[] = Array.isArray(v.assigned_services) ? v.assigned_services : [];
              const live = v.is_available !== false && v.is_active !== false;
              return (
                <div key={v.id} className="border border-white/15 rounded-2xl overflow-hidden bg-black flex flex-col justify-between">
                  <div>
                    {v.image_url ? (
                      <img src={v.image_url} alt={v.name} className="w-full aspect-[16/9] object-cover border-b border-white/10" />
                    ) : null}
                    <div className="p-5 space-y-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/10 text-white/70">{v.category}</span>
                          <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${live ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                            {live ? 'Active' : 'Unavailable'}
                          </span>
                          <span className="text-[10px] font-mono text-white/40 ml-auto">v{v.pricing_version || 1}</span>
                        </div>
                        <h3 className="text-base font-bold text-white mt-1.5">{v.name}</h3>
                        <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{v.description}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                        <div className="p-2 rounded bg-white/[0.03] border border-white/10">
                          <span className="text-white/40 block text-[9px]">PASSENGERS</span>
                          <span className="text-white font-bold">{v.passenger_capacity}</span>
                        </div>
                        <div className="p-2 rounded bg-white/[0.03] border border-white/10">
                          <span className="text-white/40 block text-[9px]">LUGGAGE</span>
                          <span className="text-white font-bold">{v.luggage_capacity}</span>
                        </div>
                        <div className="p-2 rounded bg-white/[0.03] border border-white/10">
                          <span className="text-white/40 block text-[9px]">MAX KG</span>
                          <span className="text-white font-bold">{v.max_weight_kg}</span>
                        </div>
                      </div>
                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-white/50">Assigned services</p>
                        <div className="grid grid-cols-2 gap-2">
                          {SERVICE_OPTIONS.map((srv) => {
                            const checked = assigned.includes(srv.id);
                            return (
                              <label
                                key={srv.id}
                                className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer ${
                                  checked ? 'border-white bg-white/10 text-white font-semibold' : 'border-white/10 text-white/40 hover:text-white/70'
                                }`}
                              >
                                <input type="checkbox" checked={checked} disabled={saving} onChange={() => toggleService(v, srv.id)} />
                                <span className="truncate">{srv.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end gap-2">
                    <button
                      onClick={() => { setVehicleForm({ ...emptyVehicle(0), ...v }); setShowVehicleModal(true); }}
                      className="px-3 py-1.5 border border-white/15 rounded-lg hover:bg-white/10 text-xs font-semibold text-white flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => handleDeleteVehicle(v.id)} className="px-2.5 py-1.5 border border-red-500/20 rounded-lg hover:bg-red-500/10 text-xs text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {vehicles.length === 0 && !loading && (
            <p className="text-center text-sm text-white/50 py-16">No vehicles in the catalogue yet.</p>
          )}
        </div>
      )}

      {/* TAB 2: RIDE-HAILING */}
      {activeTab === 'ride_hailing' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {vehiclesFor('ride_hailing').map((v) => {
            const cfg = v.service_pricing?.ride_hailing || {};
            const set = (patch: any) => updateVehiclePricingLocal(v.id, 'ride_hailing', patch);
            return (
              <div key={v.id} className="border border-white/15 rounded-xl p-5 bg-black space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="text-sm font-bold text-white">{v.name}</h3>
                  <button
                    onClick={() => saveVehiclePricing(v, 'ride_hailing')}
                    disabled={saving}
                    className="px-3 py-1.5 bg-white text-black rounded text-xs font-semibold flex items-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5" /> Save
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <NumField label="Base Fare" value={cfg.baseFareUgx} onChange={(x) => set({ baseFareUgx: x })} />
                  <NumField label="Minimum Fare" value={cfg.minimumFareUgx} onChange={(x) => set({ minimumFareUgx: x })} />
                  <NumField label="Per Minute" step={50} value={cfg.perMinuteUgx} onChange={(x) => set({ perMinuteUgx: x })} />
                  <NumField label="Waiting / Min" step={50} value={cfg.waitingFeePerMinUgx} onChange={(x) => set({ waitingFeePerMinUgx: x })} />
                  <NumField label="Booking Fee" value={cfg.bookingFeeUgx} onChange={(x) => set({ bookingFeeUgx: x })} />
                  <NumField label="Cancel Fee" value={cfg.cancellationFeeUgx} onChange={(x) => set({ cancellationFeeUgx: x })} />
                  <NumField label="Peak Multiplier" step={0.1} value={cfg.peakMultiplier ?? 1} onChange={(x) => set({ peakMultiplier: x || 1 })} />
                  <div>
                    <label className={labelCls}>Mode</label>
                    <select value={cfg.calculationMode || 'BAND_MATCH'} onChange={(e) => set({ calculationMode: e.target.value })} className={inputCls}>
                      <option value="BAND_MATCH">Band match</option>
                      <option value="PROGRESSIVE">Progressive</option>
                    </select>
                  </div>
                </div>
                <BandsEditor bands={Array.isArray(cfg.distanceBands) ? cfg.distanceBands : DEFAULT_BANDS} onChange={(b) => set({ distanceBands: b })} />
              </div>
            );
          })}
          {vehiclesFor('ride_hailing').length === 0 && (
            <p className="text-sm text-white/50">No vehicles are assigned to Ride-Hailing. Assign them in the Vehicle Catalogue tab.</p>
          )}
        </div>
      )}

      {/* TAB 3: AIRPORT SHUTTLE */}
      {activeTab === 'airport_shuttle' && (
        <div className="space-y-6">
          <div className="border border-white/15 rounded-xl p-5 bg-black space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Shuttle Routes</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setRules((p) => ({ ...p, airport_shuttle: { ...(p.airport_shuttle || {}), routes: [...shuttleRoutes, { id: `route_${Date.now()}`, name: 'New Route', distanceKm: 10, defaultMinutes: 20 }] } }))}
                  className="px-3 py-1.5 border border-white/20 rounded text-xs text-white"
                >
                  + Route
                </button>
                <button onClick={() => saveRule('airport_shuttle')} disabled={saving} className="px-3 py-1.5 bg-white text-black rounded text-xs font-semibold flex items-center gap-1">
                  <Save className="w-3.5 h-3.5" /> Save Routes
                </button>
              </div>
            </div>
            {shuttleRoutes.map((r, i) => {
              const setRoute = (patch: any) => {
                const next = [...shuttleRoutes];
                next[i] = { ...r, ...patch };
                setRules((p) => ({ ...p, airport_shuttle: { ...(p.airport_shuttle || {}), routes: next } }));
              };
              return (
                <div key={r.id || i} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end bg-white/[0.02] p-2 rounded border border-white/10">
                  <div>
                    <label className={labelCls}>Route Code</label>
                    <input value={r.id} onChange={(e) => setRoute({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} className={inputCls} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Name</label>
                    <input value={r.name} onChange={(e) => setRoute({ name: e.target.value })} className={inputCls} />
                  </div>
                  <NumField label="Distance Km" step={1} value={r.distanceKm} onChange={(x) => setRoute({ distanceKm: x })} />
                  <div className="flex items-end gap-2">
                    <NumField label="Minutes" step={5} value={r.defaultMinutes} onChange={(x) => setRoute({ defaultMinutes: x })} />
                    <button onClick={() => setRules((p) => ({ ...p, airport_shuttle: { ...(p.airport_shuttle || {}), routes: shuttleRoutes.filter((_, j) => j !== i) } }))} className="text-red-400 px-1 pb-2">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {vehiclesFor('airport_shuttle').map((v) => {
              const cfg = v.service_pricing?.airport_shuttle || {};
              const set = (patch: any) => updateVehiclePricingLocal(v.id, 'airport_shuttle', patch);
              const fixed: Record<string, number> = cfg.fixedRoutes || {};
              return (
                <div key={v.id} className="border border-white/15 rounded-xl p-5 bg-black space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="text-sm font-bold text-white">{v.name}</h3>
                    <button onClick={() => saveVehiclePricing(v, 'airport_shuttle')} disabled={saving} className="px-3 py-1.5 bg-white text-black rounded text-xs font-semibold flex items-center gap-1">
                      <Save className="w-3.5 h-3.5" /> Save
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <NumField label="Base Fare" value={cfg.baseFareUgx} onChange={(x) => set({ baseFareUgx: x })} />
                    <NumField label="Minimum Fare" value={cfg.minimumFareUgx} onChange={(x) => set({ minimumFareUgx: x })} />
                    <NumField label="Per Km (custom)" step={100} value={cfg.perKmUgx} onChange={(x) => set({ perKmUgx: x })} />
                    <NumField label="Extra Luggage" value={cfg.extraLuggageFeeUgx} onChange={(x) => set({ extraLuggageFeeUgx: x })} />
                    <NumField label="Waiting / Min" step={50} value={cfg.waitingFeePerMinUgx} onChange={(x) => set({ waitingFeePerMinUgx: x })} />
                    <NumField label="Round-Trip x" step={0.05} value={cfg.roundTripMultiplier ?? 1.85} onChange={(x) => set({ roundTripMultiplier: x || 1 })} />
                  </div>
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <span className="text-[10px] font-mono uppercase text-white/60">Fixed route fares (UGX)</span>
                    {shuttleRoutes.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-white/80 truncate">{r.name}</span>
                        <input
                          type="number"
                          step={5000}
                          value={fixed[r.id] ?? ''}
                          placeholder="per-km"
                          onChange={(e) => {
                            const next = { ...fixed };
                            if (e.target.value === '') delete next[r.id];
                            else next[r.id] = parseInt(e.target.value) || 0;
                            set({ fixedRoutes: next });
                          }}
                          className="w-36 bg-black border border-white/20 rounded px-2.5 py-1 text-xs text-white font-mono text-right"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: EXPRESS DELIVERY */}
      {activeTab === 'express_delivery' && (
        <div className="space-y-6">
          <div className="border border-white/15 rounded-xl p-5 bg-black space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Package category surcharges (UGX)</h3>
              <button onClick={() => saveRule('express_delivery')} disabled={saving} className="px-3 py-1.5 bg-white text-black rounded text-xs font-semibold flex items-center gap-1">
                <Save className="w-3.5 h-3.5" /> Save
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Object.entries(categorySurcharges).map(([cat, fee]) => (
                <NumField
                  key={cat}
                  label={cat.replace(/_/g, ' ')}
                  value={fee}
                  onChange={(x) => setRules((p) => ({
                    ...p,
                    express_delivery: { ...(p.express_delivery || {}), categorySurchargesUgx: { ...categorySurcharges, [cat]: x } },
                  }))}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {vehiclesFor('express_delivery').map((v) => {
              const cfg = v.service_pricing?.express_delivery || {};
              const set = (patch: any) => updateVehiclePricingLocal(v.id, 'express_delivery', patch);
              return (
                <div key={v.id} className="border border-white/15 rounded-xl p-5 bg-black space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="text-sm font-bold text-white">{v.name}</h3>
                    <button onClick={() => saveVehiclePricing(v, 'express_delivery')} disabled={saving} className="px-3 py-1.5 bg-white text-black rounded text-xs font-semibold flex items-center gap-1">
                      <Save className="w-3.5 h-3.5" /> Save
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <NumField label="Base Fee" value={cfg.baseFeeUgx} onChange={(x) => set({ baseFeeUgx: x })} />
                    <NumField label="Minimum Fee" value={cfg.minimumFeeUgx} onChange={(x) => set({ minimumFeeUgx: x })} />
                    <NumField label="Free Weight Kg" step={1} value={cfg.freeWeightKg} onChange={(x) => set({ freeWeightKg: x })} />
                    <NumField label="Per Extra Kg" step={100} value={cfg.perKgSurchargeUgx} onChange={(x) => set({ perKgSurchargeUgx: x })} />
                    <NumField label="Extra Stop Fee" value={cfg.multiStopFeeUgx} onChange={(x) => set({ multiStopFeeUgx: x })} />
                    <NumField label="Priority x" step={0.05} value={cfg.expressPriorityMultiplier ?? 1.25} onChange={(x) => set({ expressPriorityMultiplier: x || 1 })} />
                  </div>
                  <BandsEditor bands={Array.isArray(cfg.distanceBands) ? cfg.distanceBands : DEFAULT_BANDS} onChange={(b) => set({ distanceBands: b })} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={runSimulator} className="border border-white/15 rounded-xl p-6 bg-black space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calculator className="w-5 h-5" /> Server quotation test
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Service</label>
                <select value={simForm.serviceType} onChange={(e) => setSimForm((p) => ({ ...p, serviceType: e.target.value, vehicleId: '' }))} className={inputCls}>
                  <option value="RIDE">Ride-Hailing</option>
                  <option value="AIRPORT_SHUTTLE">Airport Shuttle</option>
                  <option value="DELIVERY">Express Delivery</option>
                  <option value="TOUR">Tour / Safari</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Vehicle</label>
                <select value={simForm.vehicleId} onChange={(e) => setSimForm((p) => ({ ...p, vehicleId: e.target.value }))} className={inputCls}>
                  <option value="">(auto)</option>
                  {vehiclesFor(
                    simForm.serviceType === 'RIDE' ? 'ride_hailing' : simForm.serviceType === 'AIRPORT_SHUTTLE' ? 'airport_shuttle' : simForm.serviceType === 'DELIVERY' ? 'express_delivery' : 'tours'
                  ).map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {(simForm.serviceType === 'RIDE' || simForm.serviceType === 'DELIVERY') && (
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Distance Km" step={0.5} value={simForm.distanceKm} onChange={(x) => setSimForm((p) => ({ ...p, distanceKm: x }))} />
                {simForm.serviceType === 'RIDE' ? (
                  <NumField label="Duration Min" step={1} value={simForm.durationMinutes} onChange={(x) => setSimForm((p) => ({ ...p, durationMinutes: x }))} />
                ) : (
                  <NumField label="Weight Kg" step={0.5} value={simForm.weightKg} onChange={(x) => setSimForm((p) => ({ ...p, weightKg: x }))} />
                )}
              </div>
            )}

            {simForm.serviceType === 'DELIVERY' && (
              <div>
                <label className={labelCls}>Package Category</label>
                <select value={simForm.packageCategory} onChange={(e) => setSimForm((p) => ({ ...p, packageCategory: e.target.value }))} className={inputCls}>
                  {Object.keys(categorySurcharges).map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            )}

            {simForm.serviceType === 'AIRPORT_SHUTTLE' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Route</label>
                  <select value={simForm.routeCode} onChange={(e) => setSimForm((p) => ({ ...p, routeCode: e.target.value }))} className={inputCls}>
                    {shuttleRoutes.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <NumField label="Extra Bags" step={1} value={simForm.extraLuggageCount} onChange={(x) => setSimForm((p) => ({ ...p, extraLuggageCount: x }))} />
                <label className="flex items-center gap-2 text-xs text-white">
                  <input type="checkbox" checked={simForm.isRoundTrip} onChange={(e) => setSimForm((p) => ({ ...p, isRoundTrip: e.target.checked }))} />
                  Round trip
                </label>
              </div>
            )}

            {simForm.serviceType === 'TOUR' && (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3">
                  <label className={labelCls}>Destination</label>
                  <select value={simForm.destinationId} onChange={(e) => setSimForm((p) => ({ ...p, destinationId: e.target.value }))} className={inputCls}>
                    <option value="">Select destination</option>
                    {destinations.map((d) => (
                      <option key={d.id} value={d.id}>{d.name || d.title}</option>
                    ))}
                  </select>
                </div>
                <NumField label="Tourists" step={1} value={simForm.guestCount} onChange={(x) => setSimForm((p) => ({ ...p, guestCount: Math.max(1, x) }))} />
                <NumField label="Days" step={1} value={simForm.durationDays} onChange={(x) => setSimForm((p) => ({ ...p, durationDays: Math.max(1, x) }))} />
              </div>
            )}

            <button type="submit" disabled={simLoading} className="w-full py-2.5 bg-white text-black font-semibold rounded-lg text-xs hover:bg-white/90">
              {simLoading ? 'Calculating…' : 'Get server quote'}
            </button>
          </form>

          <div className="border border-white/15 rounded-xl p-6 bg-black">
            {simResult ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 uppercase block">Quotation</span>
                    <h4 className="text-sm font-mono font-bold text-white">{simResult.quotationId}</h4>
                  </div>
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-white/10 text-white">Pricing v{simResult.pricingVersion}</span>
                </div>
                {(simResult.breakdown || []).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs font-mono py-1.5 border-b border-white/5">
                    <div>
                      <span className="text-white">{item.label}</span>
                      {item.details && <span className="text-white/40 block text-[10px]">{item.details}</span>}
                    </div>
                    <span className="text-white font-semibold">UGX {Number(item.amountUgx).toLocaleString()}</span>
                  </div>
                ))}
                <div className="pt-3 border-t border-white/20 flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-white/60">Total</span>
                  <span className="text-xl font-mono font-bold text-emerald-400">UGX {Number(simResult.totalPriceUgx).toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-white/40 text-xs font-mono">Run a quote to see the itemized server breakdown.</div>
            )}
          </div>
        </div>
      )}

      {/* VEHICLE MODAL */}
      {showVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-black border border-white/20 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white">{vehicleForm.id ? `Edit ${vehicleForm.name}` : 'Add Vehicle to Catalogue'}</h3>
              <button onClick={() => setShowVehicleModal(false)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await saveVehicle(vehicleForm, vehicleForm.id ? 'Vehicle updated.' : 'Vehicle added to catalogue.');
                if (ok) setShowVehicleModal(false);
              }}
              className="space-y-4"
            >
              <ImageUploader
                label="Vehicle Photo (Cloudflare R2)"
                value={vehicleForm.image_url}
                onChange={(url) => setVehicleForm((p: any) => ({ ...p, image_url: url }))}
                folder="fleet"
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Name *</label>
                  <input required value={vehicleForm.name} onChange={(e) => setVehicleForm((p: any) => ({ ...p, name: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Code (used by app)</label>
                  <input value={vehicleForm.code} disabled={!!vehicleForm.id} placeholder="auto" onChange={(e) => setVehicleForm((p: any) => ({ ...p, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Category</label>
                  <input value={vehicleForm.category} onChange={(e) => setVehicleForm((p: any) => ({ ...p, category: e.target.value }))} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Make</label>
                    <input value={vehicleForm.make} onChange={(e) => setVehicleForm((p: any) => ({ ...p, make: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Model</label>
                    <input value={vehicleForm.model} onChange={(e) => setVehicleForm((p: any) => ({ ...p, model: e.target.value }))} className={inputCls} />
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <input value={vehicleForm.description} onChange={(e) => setVehicleForm((p: any) => ({ ...p, description: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <NumField label="Passengers" step={1} value={vehicleForm.passenger_capacity} onChange={(x) => setVehicleForm((p: any) => ({ ...p, passenger_capacity: x }))} />
                <NumField label="Luggage" step={1} value={vehicleForm.luggage_capacity} onChange={(x) => setVehicleForm((p: any) => ({ ...p, luggage_capacity: x }))} />
                <NumField label="Max Kg" step={5} value={vehicleForm.max_weight_kg} onChange={(x) => setVehicleForm((p: any) => ({ ...p, max_weight_kg: x }))} />
                <NumField label="ETA Min" step={1} value={vehicleForm.eta_minutes} onChange={(x) => setVehicleForm((p: any) => ({ ...p, eta_minutes: x }))} />
              </div>

              <div className="space-y-2 pt-2 border-t border-white/10">
                <label className={labelCls}>Service assignments</label>
                <div className="grid grid-cols-2 gap-2">
                  {SERVICE_OPTIONS.map((srv) => {
                    const checked = (vehicleForm.assigned_services || []).includes(srv.id);
                    return (
                      <label key={srv.id} className="flex items-center gap-2 p-2.5 rounded border border-white/15 text-xs text-white cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setVehicleForm((p: any) => ({
                            ...p,
                            assigned_services: checked ? p.assigned_services.filter((s: string) => s !== srv.id) : [...(p.assigned_services || []), srv.id],
                          }))}
                        />
                        {srv.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              {(vehicleForm.assigned_services || []).includes('tours') && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/10">
                  {[
                    ['dailyHireRateUgx', 'Tour Daily Hire', 10000],
                    ['perKmRateUgx', 'Tour Per Km', 100],
                    ['driverAllowancePerDayUgx', 'Driver / Day', 5000],
                    ['includedKmPerDay', 'Incl. Km / Day', 10],
                  ].map(([k, l, s]) => (
                    <NumField
                      key={k as string}
                      label={l as string}
                      step={s as number}
                      value={vehicleForm.service_pricing?.tours?.[k as string]}
                      onChange={(x) => setVehicleForm((p: any) => ({
                        ...p,
                        service_pricing: { ...(p.service_pricing || {}), tours: { ...(p.service_pricing?.tours || {}), [k as string]: x } },
                      }))}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                  <input type="checkbox" checked={vehicleForm.is_available} onChange={(e) => setVehicleForm((p: any) => ({ ...p, is_available: e.target.checked }))} />
                  Available
                </label>
                <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                  <input type="checkbox" checked={vehicleForm.is_active} onChange={(e) => setVehicleForm((p: any) => ({ ...p, is_active: e.target.checked }))} />
                  Active
                </label>
              </div>
              <p className="text-[11px] text-white/40">Per-service fares (ride bands, shuttle routes, delivery fees) are edited in their own tabs after the vehicle is assigned.</p>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button type="button" onClick={() => setShowVehicleModal(false)} className="px-4 py-2 border border-white/20 rounded text-xs text-white/70">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-white text-black font-semibold rounded text-xs">{saving ? 'Saving…' : 'Save Vehicle'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
