'use client';

import React, { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { api } from '../lib/api';
import {
  DollarSign,
  Compass,
  Car,
  Package,
  Users,
  ShieldCheck,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';

export default function OverviewPage() {
  const [data, setData] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingFlag, setUpdatingFlag] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setRefreshing(true);
      const [statsRes, configRes] = await Promise.all([api.getStats(), api.getConfig()]);
      setData(statsRes);
      setConfig(configRes);
    } catch (err) {
      console.error('Failed to load overview data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleFeature = async (key: string, currentVal: boolean) => {
    if (!config) return;
    try {
      setUpdatingFlag(key);
      const updatedFeatures = {
        ...(config.featureFlags || {}),
        [key]: !currentVal,
      };
      await api.updateFeatures(updatedFeatures);
      setConfig((prev: any) => ({
        ...prev,
        featureFlags: updatedFeatures,
      }));
    } catch (err) {
      console.error(`Failed to toggle ${key}:`, err);
    } finally {
      setUpdatingFlag(null);
    }
  };

  const kpis = data?.kpis || {};
  const system = data?.system || {};
  const featureFlags = config?.featureFlags || {};
  const versionConfig = config?.versionConfig || {};

  return (
    <div>
      <Header
        title="Overview & Live Operations"
        subtitle="Real-time control and KPIs for SAFARIS Uganda platform"
        onRefresh={loadData}
        isRefreshing={refreshing}
      />

      <main className="p-8 space-y-8 max-w-7xl">
        {/* Top KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Revenue Card */}
          <div className="p-5 rounded-lg border border-white/10 bg-black hover:border-white/20 transition-colors">
            <div className="flex items-center justify-between text-white/50 text-xs uppercase tracking-wider mb-2">
              <span>Platform Revenue</span>
              <DollarSign className="w-4 h-4 text-white/40" />
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading
                ? '...'
                : `UGX ${(kpis.totalRevenueUgx || 0).toLocaleString()}`}
            </div>
            <div className="text-[11px] text-white/40 mt-1 flex items-center justify-between">
              <span>Tours + Rides + Deliveries</span>
              <span className="text-white/70">100% Mock/Live</span>
            </div>
          </div>

          {/* Tourism Bookings */}
          <div className="p-5 rounded-lg border border-white/10 bg-black hover:border-white/20 transition-colors">
            <div className="flex items-center justify-between text-white/50 text-xs uppercase tracking-wider mb-2">
              <span>Safari Bookings</span>
              <Compass className="w-4 h-4 text-white/40" />
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading ? '...' : kpis.totalBookings || 0}
            </div>
            <div className="text-[11px] text-white/40 mt-1 flex items-center justify-between">
              <span>Active: {kpis.activeBookingsCount || 0}</span>
              <span className="text-white/60">UGX {(kpis.bookingsRevenueUgx || 0).toLocaleString()}</span>
            </div>
          </div>

          {/* Ride Trips */}
          <div className="p-5 rounded-lg border border-white/10 bg-black hover:border-white/20 transition-colors">
            <div className="flex items-center justify-between text-white/50 text-xs uppercase tracking-wider mb-2">
              <span>Mobility Trips</span>
              <Car className="w-4 h-4 text-white/40" />
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading ? '...' : kpis.totalTrips || 0}
            </div>
            <div className="text-[11px] text-white/40 mt-1 flex items-center justify-between">
              <span>Active Rides: {kpis.activeTripsCount || 0}</span>
              <span className="text-white/60">UGX {(kpis.tripsRevenueUgx || 0).toLocaleString()}</span>
            </div>
          </div>

          {/* Parcel Deliveries */}
          <div className="p-5 rounded-lg border border-white/10 bg-black hover:border-white/20 transition-colors">
            <div className="flex items-center justify-between text-white/50 text-xs uppercase tracking-wider mb-2">
              <span>Courier Parcels</span>
              <Package className="w-4 h-4 text-white/40" />
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading ? '...' : kpis.totalDeliveries || 0}
            </div>
            <div className="text-[11px] text-white/40 mt-1 flex items-center justify-between">
              <span>In Transit: {kpis.activeDeliveriesCount || 0}</span>
              <span className="text-white/60">UGX {(kpis.deliveriesRevenueUgx || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* System Health & Quick Master Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Remote Switches */}
          <div className="lg:col-span-2 p-6 rounded-lg border border-white/10 bg-black space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Live Mobile Feature Flags</h2>
                <p className="text-xs text-white/50">
                  Instant toggles pushed directly to mobile apps via /app-config
                </p>
              </div>
              <span className="text-[10px] font-mono text-white/40 border border-white/10 px-2 py-0.5 rounded">
                DYNAMIC
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  key: 'instant_mobile_money_pay',
                  title: 'Instant Mobile Money (MTN/Airtel)',
                  desc: 'Allow in-app automated MoMo payments',
                },
                {
                  key: 'boda_rides_enabled',
                  title: 'Boda Boda Ride Hailing',
                  desc: 'Motorcycle passenger transport in Kampala',
                },
                {
                  key: 'custom_guide_selection',
                  title: 'Custom Tour Guide Hiring',
                  desc: 'Allow users to handpick certified guides',
                },
                {
                  key: 'night_rides_surcharge',
                  title: 'Night Ride Dynamic Multiplier',
                  desc: 'Apply 1.15x pricing past 10:00 PM',
                },
              ].map((flag) => {
                const isEnabled = Boolean(featureFlags[flag.key]);
                const isUpdating = updatingFlag === flag.key;
                return (
                  <div
                    key={flag.key}
                    className="p-4 rounded border border-white/10 bg-white/[0.02] flex items-center justify-between hover:border-white/20 transition-all"
                  >
                    <div className="pr-2">
                      <div className="text-xs font-semibold text-white">{flag.title}</div>
                      <div className="text-[11px] text-white/40 mt-0.5">{flag.desc}</div>
                    </div>
                    <button
                      onClick={() => toggleFeature(flag.key, isEnabled)}
                      disabled={isUpdating}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none ${
                        isEnabled
                          ? 'bg-white border-white'
                          : 'bg-black border-white/30'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-black shadow ring-0 transition duration-200 ease-in-out ${
                          isEnabled ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white/40'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* System & Architecture Status */}
          <div className="p-6 rounded-lg border border-white/10 bg-black space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h2 className="text-sm font-semibold text-white">Infrastructure State</h2>
              <Server className="w-4 h-4 text-white/40" />
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                <span className="text-white/50">Production VPS</span>
                <span className="font-mono text-white/90">18.222.41.199</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                <span className="text-white/50">API Gateway</span>
                <span className="font-mono text-white/90">Node 22 / Express (/api/v1)</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                <span className="text-white/50">Database Tier</span>
                <span className="font-mono text-white/90">PostgreSQL 16 & Fallback</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                <span className="text-white/50">Real-Time Hub</span>
                <span className="font-mono text-white/90">Socket.io & Redis 7</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                <span className="text-white/50">Auto-Deploy</span>
                <span className="font-mono text-white/90">GitHub Poller (45s sync)</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-white/50">Mobile Target</span>
                <span className="font-mono text-white/90">v{versionConfig.latestVersion || '1.0.1'}</span>
              </div>
            </div>

            <div className="pt-2">
              <div className="p-3 rounded border border-white/10 bg-white/[0.02] text-[11px] text-white/70 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-white shrink-0 mt-0.5" />
                <span>
                  All modifications made in this dashboard reflect immediately across mobile apps
                  connected to the VPS backend.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Resources Counter Summary */}
        <div className="p-6 rounded-lg border border-white/10 bg-black">
          <h3 className="text-xs uppercase tracking-widest text-white/50 mb-4 font-mono">
            Platform Entity Counts
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 text-center">
            <div className="p-3 rounded border border-white/10 bg-white/[0.01]">
              <div className="text-xl font-bold text-white">{kpis.totalDestinations || 4}</div>
              <div className="text-[10px] text-white/40 uppercase mt-1">Destinations</div>
            </div>
            <div className="p-3 rounded border border-white/10 bg-white/[0.01]">
              <div className="text-xl font-bold text-white">{kpis.totalPackages || 3}</div>
              <div className="text-[10px] text-white/40 uppercase mt-1">Tour Packages</div>
            </div>
            <div className="p-3 rounded border border-white/10 bg-white/[0.01]">
              <div className="text-xl font-bold text-white">{kpis.totalGuides || 1}</div>
              <div className="text-[10px] text-white/40 uppercase mt-1">UWA Guides</div>
            </div>
            <div className="p-3 rounded border border-white/10 bg-white/[0.01]">
              <div className="text-xl font-bold text-white">{kpis.totalDrivers || 2}</div>
              <div className="text-[10px] text-white/40 uppercase mt-1">Drivers</div>
            </div>
            <div className="p-3 rounded border border-white/10 bg-white/[0.01]">
              <div className="text-xl font-bold text-white">{kpis.totalUsers || 5}</div>
              <div className="text-[10px] text-white/40 uppercase mt-1">Total Users</div>
            </div>
            <div className="p-3 rounded border border-white/10 bg-white/[0.01]">
              <div className="text-xl font-bold text-white">7</div>
              <div className="text-[10px] text-white/40 uppercase mt-1">App Services</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
