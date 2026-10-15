'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Globe, 
  Smartphone, 
  ShieldAlert,
  ShieldCheck,
  Server,
  MapPin,
  Compass,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Cloud,
  UploadCloud,
  Database
} from 'lucide-react';
import { api } from '@/lib/api';
import { getStorageStatus, StorageStatus } from '@/lib/storage';
import { ImageUploader } from '@/components/ImageUploader';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [mapboxToken, setMapboxToken] = useState('');
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [testUploadUrl, setTestUploadUrl] = useState('');

  const [versionConfig, setVersionConfig] = useState({
    minVersion: '1.0.0',
    latestVersion: '1.0.0',
    forceUpdate: false,
    maintenanceMode: false,
    maintenanceMessage: 'System undergoing scheduled maintenance. Back online shortly.',
  });

  const [quickPlaces, setQuickPlaces] = useState<any[]>([
    { id: 'dest_entebbe', title: 'Entebbe Airport', subtitle: 'Airport Corridor', latitude: 0.0444, longitude: 32.4469, city: 'Entebbe' },
    { id: 'dest_jinja', title: 'Jinja Nile Source', subtitle: 'Adventure Hub', latitude: 0.4356, longitude: 33.2032, city: 'Jinja' },
    { id: 'dest_bwindi', title: 'Bwindi Gorillas', subtitle: 'National Park', latitude: -1.0478, longitude: 29.7028, city: 'Bwindi' },
    { id: 'dest_murchison', title: 'Murchison Falls', subtitle: 'Safari & Wildlife', latitude: 2.2856, longitude: 31.6845, city: 'Murchison' },
    { id: 'dest_queen_elizabeth', title: 'Queen Elizabeth', subtitle: 'Tree Climbing Lions', latitude: -0.2289, longitude: 29.9741, city: 'Kasese' },
    { id: 'dest_lake_mburo', title: 'Lake Mburo', subtitle: 'Zebra Sanctuary', latitude: -0.6358, longitude: 30.9328, city: 'Kiruhura' },
  ]);

  const [isAddingPlace, setIsAddingPlace] = useState(false);
  const [newPlace, setNewPlace] = useState({
    title: '',
    subtitle: '',
    latitude: 0.3136,
    longitude: 32.5811,
    city: 'Kampala',
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);

    if (!currentPassword) {
      setPasswordFeedback({ text: 'Current password is required.', type: 'error' });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setPasswordFeedback({ text: 'New password must be at least 8 characters long.', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ text: 'New passwords do not match.', type: 'error' });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await api.changeAdminPassword({ currentPassword, newPassword });
      setPasswordFeedback({ text: res.message || 'Admin password successfully updated in database.', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordFeedback({ text: err.message || 'Failed to update password.', type: 'error' });
    } finally {
      setChangingPassword(false);
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      // Purge any legacy browser local storage so the admin panel strictly uses the server database
      if (typeof window !== 'undefined') {
        localStorage.removeItem('safaris_mapbox_token');
      }

      const config = await api.getConfig();
      if (config) {
        if (config.versionConfig) {
          setVersionConfig(config.versionConfig);
        }
        if (config.quickPlaces && Array.isArray(config.quickPlaces)) {
          setQuickPlaces(config.quickPlaces);
        }
        // ONLY use the saved permanent token from the server database
        // Fall back to the NEXT_PUBLIC_MAPBOX_TOKEN environment variable if DB has no saved token
        const envToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
        if (config.mapboxAccessToken) {
          setMapboxToken(String(config.mapboxAccessToken).trim());
        } else if (envToken) {
          setMapboxToken(envToken.trim());
        } else {
          setMapboxToken('');
        }
      }

      // Check Cloudflare R2 object storage status
      try {
        const status = await getStorageStatus();
        setStorageStatus(status);
      } catch (storageErr) {
        console.warn('Storage status check error', storageErr);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load system settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const cleanToken = mapboxToken.trim();

      // Ensure no browser local storage token remains
      if (typeof window !== 'undefined') {
        localStorage.removeItem('safaris_mapbox_token');
      }

      const [_, updatedConfig] = await Promise.all([
        api.updateVersionConfig(versionConfig),
        api.updateConfig({ 
          mapboxAccessToken: cleanToken,
          quickPlaces: quickPlaces,
        }),
      ]);

      if (updatedConfig && updatedConfig.mapboxAccessToken !== undefined) {
        setMapboxToken(String(updatedConfig.mapboxAccessToken).trim());
      }
      if (updatedConfig && updatedConfig.quickPlaces) {
        setQuickPlaces(updatedConfig.quickPlaces);
      }

      setMessage({ text: 'System settings, Mapbox token & Homescreen Quick Places saved permanently to database!', type: 'success' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ text: `Failed to save: ${err.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddPlace = () => {
    if (!newPlace.title.trim()) return;
    const place = {
      id: `dest_${Date.now()}`,
      title: newPlace.title.trim(),
      subtitle: newPlace.subtitle.trim() || newPlace.city.trim(),
      latitude: Number(newPlace.latitude) || 0.3136,
      longitude: Number(newPlace.longitude) || 32.5811,
      city: newPlace.city.trim() || 'Uganda',
    };
    setQuickPlaces(prev => [...prev, place]);
    setNewPlace({
      title: '',
      subtitle: '',
      latitude: 0.3136,
      longitude: 32.5811,
      city: 'Kampala',
    });
    setIsAddingPlace(false);
  };

  const handleRemovePlace = (index: number) => {
    setQuickPlaces(prev => prev.filter((_, i) => i !== index));
  };

  const handleMovePlace = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === quickPlaces.length - 1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    setQuickPlaces(prev => {
      const copy = [...prev];
      const item = copy.splice(index, 1)[0];
      copy.splice(targetIndex, 0, item);
      return copy;
    });
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 min-w-0 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Settings className="w-7 h-7 text-white" />
            System & Infrastructure Settings
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Mobile version lifecycle enforcement, maintenance broadcasts, and DNS domain routing status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadSettings}
            disabled={loading || saving}
            className="flex items-center gap-2 px-3 py-2 text-xs border border-white/20 rounded-md hover:bg-white/10 text-white/80 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-white text-black rounded-md hover:bg-white/90 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Applying...' : 'Save Settings'}
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

      {/* Domain Readiness Box */}
      <div className="border border-white/20 rounded-xl p-6 bg-white/[0.02]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg border border-white/20 flex items-center justify-center bg-white/[0.04]">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Custom Domain Status</h3>
              <p className="text-xs text-white/50 font-mono mt-0.5">admin.mumwesafarisuganda.com</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded text-[10px] font-mono uppercase bg-white text-black font-semibold">
            Ready for DNS
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-3 border border-white/10 rounded-lg bg-black">
            <p className="text-white/40 text-[10px] uppercase">Record Type</p>
            <p className="text-white font-semibold mt-1">A Record / CNAME</p>
          </div>
          <div className="p-3 border border-white/10 rounded-lg bg-black">
            <p className="text-white/40 text-[10px] uppercase">Destination IP</p>
            <p className="text-white font-semibold mt-1">18.222.41.199</p>
          </div>
          <div className="p-3 border border-white/10 rounded-lg bg-black">
            <p className="text-white/40 text-[10px] uppercase">Nginx Reverse Proxy</p>
            <p className="text-white font-semibold mt-1">Pre-configured (Port 3001)</p>
          </div>
        </div>

        <p className="text-xs text-white/50 mt-4 leading-relaxed">
          * As soon as you update the DNS records on your domain registrar, Let&apos;s Encrypt SSL will be automatically provisioned for full HTTPS coverage.
        </p>
      </div>

      {/* Mapbox Mapping & Telemetry Configuration */}
      <div className="border border-white/15 rounded-xl p-6 bg-black space-y-6">
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg border border-white/20 flex items-center justify-center bg-white/[0.04]">
              <MapPin className="w-5 h-5 text-[#E5A93C]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Mapbox Public Access Token</h3>
              <p className="text-xs text-white/50 mt-0.5">Powers live fleet radar, turn-by-turn routing, and luxury vector maps across Admin & Mobile apps.</p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase font-semibold ${
            mapboxToken.trim().startsWith('pk.') 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}>
            {mapboxToken.trim().startsWith('pk.') ? 'Saved in DB (Encrypted)' : 'Token Required (Saved in DB)'}
          </span>
        </div>

        <div className="space-y-3">
          <label className="text-xs text-white/60 uppercase font-mono">Mapbox Public Access Token (pk.xxx)</label>
          <input
            type="text"
            value={mapboxToken}
            onChange={e => setMapboxToken(e.target.value)}
            placeholder="pk.eyJ1IjoibXVtd2VzYWZhcmlzIn0..."
            className="w-full bg-[#141518] border border-white/20 rounded-md px-3 py-2.5 text-xs font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-[#E5A93C]"
          />
          <p className="text-[11px] text-white/40 leading-relaxed">
            When saved here, this token is encrypted using AES-256 and stored permanently in the PostgreSQL database (<code className="text-white/70">app_config</code> table). Both the Admin Web Panel and Mobile App fetch this permanent token directly from the database API (<code className="text-white/70">/api/v1/app-config</code>).
          </p>
        </div>
      </div>

      {/* Cloudflare R2 Object Storage (Zero-Server-Overhead CDN) */}
      <div className="border border-white/15 rounded-xl p-6 bg-black space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg border border-white/20 flex items-center justify-center bg-white/[0.04]">
              <Cloud className="w-5 h-5 text-[#E5A93C]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Cloudflare R2 Object Storage (CDN Media)</h3>
              <p className="text-xs text-white/50 mt-0.5">
                Direct client-to-Cloudflare uploads and edge caching. Zero image byte transfers touch the VPS server.
              </p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase font-semibold self-start sm:self-auto ${
            storageStatus?.configured
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}>
            {storageStatus?.configured ? 'Active & Ready' : 'Pending .env.production Keys'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-lg border border-white/10 bg-[#141518] space-y-1">
            <span className="text-[11px] uppercase font-mono text-white/40">R2 Bucket Name</span>
            <p className="text-sm font-mono text-white font-semibold">{storageStatus?.bucketName || 'Not configured'}</p>
          </div>
          <div className="p-3.5 rounded-lg border border-white/10 bg-[#141518] space-y-1">
            <span className="text-[11px] uppercase font-mono text-white/40">Public CDN Base URL</span>
            <p className="text-sm font-mono text-white font-semibold truncate">
              {storageStatus?.publicBaseUrl || 'Default direct URL (pub-xxx.r2.dev or custom CDN)'}
            </p>
          </div>
        </div>

        {/* Live Direct Upload Tester */}
        <div className="border border-white/10 rounded-lg p-4 bg-white/[0.02] space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white uppercase font-mono flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-[#E5A93C]" />
              Test Direct Cloudflare Upload (Zero Server Load)
            </h4>
            {storageStatus?.configured && (
              <span className="text-[10px] text-emerald-400 font-mono">Presigned SigV4 Engine Active</span>
            )}
          </div>
          <ImageUploader
            value={testUploadUrl}
            onChange={url => setTestUploadUrl(url)}
            folder="general"
            label="Upload Test Image"
            recommendedSize="Uploads directly to your Cloudflare R2 bucket"
          />
        </div>

        <div className="space-y-2 text-xs text-white/60 leading-relaxed border-t border-white/10 pt-4">
          <p className="font-semibold text-white/80">How Direct Cloudflare Storage Works:</p>
          <ul className="list-disc pl-5 space-y-1 text-white/50 text-[11px]">
            <li>When you upload an image, your browser requests a short-lived AWS SigV4 signed URL from the backend.</li>
            <li>The file is sent <strong>directly from your browser to Cloudflare R2</strong> via HTTP PUT.</li>
            <li>The Node.js VPS server only passes small JSON URLs and never processes image bytes, keeping CPU and RAM at 0%.</li>
            <li>Client apps stream images from the Cloudflare edge global CDN.</li>
          </ul>
        </div>
      </div>

      {/* Homescreen Quick Places Management */}
      <div className="border border-white/15 rounded-xl p-6 bg-black space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg border border-white/20 flex items-center justify-center bg-white/[0.04]">
              <Compass className="w-5 h-5 text-[#E5A93C]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Homescreen Quick Places (Below Map)</h3>
              <p className="text-xs text-white/50 mt-0.5">
                Configure the destination shortcut buttons shown below the map on the mobile app homescreen.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAddingPlace(!isAddingPlace)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#E5A93C] text-black rounded-md hover:bg-[#E5A93C]/90 transition-colors self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            {isAddingPlace ? 'Cancel' : 'Add Quick Place'}
          </button>
        </div>

        {/* Add New Place Form */}
        {isAddingPlace && (
          <div className="p-4 rounded-lg border border-[#E5A93C]/40 bg-[#E5A93C]/[0.03] space-y-4">
            <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-[#E5A93C]" /> Add New Shortcut Button
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-white/60 uppercase font-mono">Button Title</label>
                <input
                  type="text"
                  value={newPlace.title}
                  onChange={e => setNewPlace(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Entebbe Airport"
                  className="w-full mt-1 bg-[#141518] border border-white/20 rounded-md px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#E5A93C]"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/60 uppercase font-mono">Subtitle / Tag</label>
                <input
                  type="text"
                  value={newPlace.subtitle}
                  onChange={e => setNewPlace(prev => ({ ...prev, subtitle: e.target.value }))}
                  placeholder="e.g. Airport Corridor"
                  className="w-full mt-1 bg-[#141518] border border-white/20 rounded-md px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#E5A93C]"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/60 uppercase font-mono">City / Region</label>
                <input
                  type="text"
                  value={newPlace.city}
                  onChange={e => setNewPlace(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="e.g. Entebbe"
                  className="w-full mt-1 bg-[#141518] border border-white/20 rounded-md px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#E5A93C]"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/60 uppercase font-mono">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={newPlace.latitude}
                  onChange={e => setNewPlace(prev => ({ ...prev, latitude: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.0444"
                  className="w-full mt-1 bg-[#141518] border border-white/20 rounded-md px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#E5A93C]"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/60 uppercase font-mono">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={newPlace.longitude}
                  onChange={e => setNewPlace(prev => ({ ...prev, longitude: parseFloat(e.target.value) || 0 }))}
                  placeholder="32.4469"
                  className="w-full mt-1 bg-[#141518] border border-white/20 rounded-md px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#E5A93C]"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleAddPlace}
                  disabled={!newPlace.title.trim()}
                  className="w-full px-4 py-2 bg-white text-black text-xs font-semibold rounded-md hover:bg-white/90 disabled:opacity-50 transition-colors"
                >
                  Confirm & Add to List
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Places List */}
        <div className="space-y-2">
          {quickPlaces.map((place, index) => (
            <div
              key={place.id || index}
              className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-[#141518] hover:border-white/25 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-white/40 w-5">#{index + 1}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{place.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-white/60 font-mono">
                      {place.city || 'Uganda'}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/40 font-mono mt-0.5">
                    {place.subtitle || 'Direct Route'} • {Number(place.latitude).toFixed(4)}°N, {Number(place.longitude).toFixed(4)}°E
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Move Up"
                  disabled={index === 0}
                  onClick={() => handleMovePlace(index, 'up')}
                  className="p-1.5 border border-white/10 rounded hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-20 transition-colors"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  title="Move Down"
                  disabled={index === quickPlaces.length - 1}
                  onClick={() => handleMovePlace(index, 'down')}
                  className="p-1.5 border border-white/10 rounded hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-20 transition-colors"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  title="Delete Place"
                  onClick={() => handleRemovePlace(index)}
                  className="p-1.5 border border-white/10 rounded hover:border-red-500/50 hover:bg-red-500/10 text-white/60 hover:text-red-400 transition-colors ml-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          {quickPlaces.length === 0 && (
            <p className="text-xs text-white/40 text-center py-6 border border-dashed border-white/10 rounded-lg font-mono">
              No quick places configured. Click &quot;Add Quick Place&quot; above.
            </p>
          )}
        </div>
        <p className="text-[11px] text-white/40">
          💡 Click <strong>Save Settings</strong> at the top right to permanently persist these quick places to the database. They update immediately in the customer app.
        </p>
      </div>

      {/* Mobile Version Management */}
      <div className="border border-white/15 rounded-xl p-6 bg-black space-y-6">
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <Smartphone className="w-5 h-5 text-white" />
          <h3 className="text-base font-bold text-white">Mobile Application Version Enforcement</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="text-xs text-white/60 uppercase font-mono">Minimum Required Version</label>
            <input
              type="text"
              value={versionConfig.minVersion}
              onChange={e => setVersionConfig(prev => ({ ...prev, minVersion: e.target.value }))}
              placeholder="1.0.0"
              className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white"
            />
            <p className="text-[11px] text-white/40 mt-1">Clients running below this version will be blocked from checkout.</p>
          </div>

          <div>
            <label className="text-xs text-white/60 uppercase font-mono">Latest Available Version</label>
            <input
              type="text"
              value={versionConfig.latestVersion}
              onChange={e => setVersionConfig(prev => ({ ...prev, latestVersion: e.target.value }))}
              placeholder="1.0.1"
              className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white"
            />
            <p className="text-[11px] text-white/40 mt-1">App Store & Play Store published build number.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <input
            type="checkbox"
            id="forceUpdate"
            checked={versionConfig.forceUpdate}
            onChange={e => setVersionConfig(prev => ({ ...prev, forceUpdate: e.target.checked }))}
            className="rounded border-white/20 bg-black text-white focus:ring-0"
          />
          <label htmlFor="forceUpdate" className="text-xs text-white/80 font-medium cursor-pointer">
            Force Update Prompt: Display mandatory update modal when app launches
          </label>
        </div>
      </div>

      {/* Maintenance Mode */}
      <div className="border border-white/15 rounded-xl p-6 bg-black space-y-6">
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <ShieldAlert className="w-5 h-5 text-white" />
          <h3 className="text-base font-bold text-white">Emergency Maintenance Mode</h3>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="maintenanceMode"
            checked={versionConfig.maintenanceMode}
            onChange={e => setVersionConfig(prev => ({ ...prev, maintenanceMode: e.target.checked }))}
            className="rounded border-white/20 bg-black text-white focus:ring-0"
          />
          <label htmlFor="maintenanceMode" className="text-xs text-white font-medium cursor-pointer">
            Enable Maintenance Lockdown (suspends all new rides and bookings)
          </label>
        </div>

        <div>
          <label className="text-xs text-white/60 uppercase font-mono">Broadcast Banner Message</label>
          <textarea
            rows={2}
            value={versionConfig.maintenanceMessage}
            onChange={e => setVersionConfig(prev => ({ ...prev, maintenanceMessage: e.target.value }))}
            placeholder="System undergoing scheduled maintenance..."
            className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
          />
        </div>
      </div>

      {/* Administrator Authentication & Security */}
      <div className="border border-white/15 rounded-xl p-6 bg-black space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-white">Administrator Credentials & Access Security</h3>
              <p className="text-xs text-white/50">Change root administrator password with BCrypt hash and database audit log</p>
            </div>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded">
            AUTHENTICATED
          </span>
        </div>

        {passwordFeedback && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
              passwordFeedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {passwordFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{passwordFeedback.text}</span>
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-xl">
          <div>
            <label className="text-xs text-white/60 uppercase font-mono">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/60 uppercase font-mono">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 uppercase font-mono">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                required
                className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <p className="text-[11px] text-white/40">
              Updates take effect immediately on next sign-in and invalidate obsolete session caches.
            </p>
            <button
              type="submit"
              disabled={changingPassword}
              className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-md hover:bg-white/90 transition-colors disabled:opacity-50 shrink-0 ml-4 flex items-center gap-2"
            >
              {changingPassword && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Update Password</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
