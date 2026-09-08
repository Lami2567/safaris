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
  Server
} from 'lucide-react';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [versionConfig, setVersionConfig] = useState({
    minVersion: '1.0.0',
    latestVersion: '1.0.0',
    forceUpdate: false,
    maintenanceMode: false,
    maintenanceMessage: 'System undergoing scheduled maintenance. Back online shortly.',
  });

  const loadSettings = async () => {
    setLoading(true);
    try {
      const config = await api.getConfig();
      if (config && config.versionConfig) {
        setVersionConfig(config.versionConfig);
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
      await api.updateVersionConfig(versionConfig);
      setMessage({ text: 'System settings & maintenance controls updated successfully!', type: 'success' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ text: `Failed to save: ${err.message}`, type: 'error' });
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
    </div>
  );
}
