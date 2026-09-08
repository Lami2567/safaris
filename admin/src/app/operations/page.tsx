'use client';

import React, { useState, useEffect } from 'react';
import { 
  Navigation, 
  Car, 
  Package, 
  Users, 
  RefreshCw, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle,
  Search
} from 'lucide-react';
import { api } from '@/lib/api';

type OperationsTab = 'trips' | 'deliveries' | 'fleet' | 'users';

export default function OperationsPage() {
  const [activeTab, setActiveTab] = useState<OperationsTab>('trips');
  const [loading, setLoading] = useState(true);

  const [trips, setTrips] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [fleet, setFleet] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const loadOperations = async () => {
    setLoading(true);
    try {
      const [t, d, f, u] = await Promise.all([
        api.getTrips().catch(() => []),
        api.getDeliveries().catch(() => []),
        api.getFleet().catch(() => []),
        api.getUsers().catch(() => []),
      ]);
      setTrips(t);
      setDeliveries(d);
      setFleet(f);
      setUsers(u);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOperations();
    const timer = setInterval(loadOperations, 15000); // 15s live polling
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Navigation className="w-7 h-7 text-white" />
            Live Dispatch & Fleet Operations
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Real-time telemetry and dispatch records across passenger rides, parcels, and active drivers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 bg-white/[0.02]">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-[11px] font-mono text-white/70">Live Polling (15s)</span>
          </div>
          <button
            onClick={loadOperations}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-xs border border-white/20 rounded-md hover:bg-white/10 text-white/80 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10">
        {[
          { id: 'trips', label: 'Rides & Trips', icon: Car, count: trips.length },
          { id: 'deliveries', label: 'Parcel Deliveries', icon: Package, count: deliveries.length },
          { id: 'fleet', label: 'Driver Fleet', icon: Users, count: fleet.length },
          { id: 'users', label: 'Registered Accounts', icon: Users, count: users.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as OperationsTab)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors relative ${
                isActive
                  ? 'border-white text-white'
                  : 'border-transparent text-white/40 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                isActive ? 'bg-white text-black font-semibold' : 'bg-white/10 text-white/60'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Table */}
      <div className="border border-white/15 rounded-xl overflow-hidden bg-black">
        {/* Tab: Trips */}
        {activeTab === 'trips' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/[0.02] text-white/40 uppercase font-mono tracking-wider">
                <tr>
                  <th className="px-5 py-3">Trip ID</th>
                  <th className="px-5 py-3">Passenger</th>
                  <th className="px-5 py-3">Pickup / Dropoff</th>
                  <th className="px-5 py-3">Fare</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/80">
                {trips.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 font-mono text-[11px] text-white/50">{t.id?.slice(0, 8)}...</td>
                    <td className="px-5 py-4 font-medium text-white">{t.rider?.name || 'Mobile Rider'}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-white/80">
                        <MapPin className="w-3 h-3 text-white/40" />
                        {t.pickupAddress || 'Kampala Road'}
                      </div>
                      <div className="flex items-center gap-1.5 text-white/40 text-[11px] mt-0.5">
                        <MapPin className="w-3 h-3 text-white/20" />
                        {t.dropoffAddress || 'Entebbe Road'}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono font-semibold text-white">
                      UGX {t.fare?.toLocaleString() || '12,000'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                        t.status === 'completed' ? 'bg-white text-black font-semibold' :
                        t.status === 'in_progress' ? 'border border-white text-white' :
                        'bg-white/10 text-white/40'
                      }`}>
                        {t.status || 'requested'}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-white/40 text-[11px]">
                      {t.createdAt ? new Date(t.createdAt).toLocaleTimeString() : 'Just now'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {trips.length === 0 && !loading && (
              <div className="text-center py-16 text-sm text-white/50">No live trips recorded yet.</div>
            )}
          </div>
        )}

        {/* Tab: Deliveries */}
        {activeTab === 'deliveries' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/[0.02] text-white/40 uppercase font-mono tracking-wider">
                <tr>
                  <th className="px-5 py-3">Tracking #</th>
                  <th className="px-5 py-3">Sender / Recipient</th>
                  <th className="px-5 py-3">Package Details</th>
                  <th className="px-5 py-3">Fee</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/80">
                {deliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 font-mono text-[11px] text-white/50">{d.trackingNumber || d.id?.slice(0, 8)}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{d.senderName || 'Sender'}</p>
                      <p className="text-[11px] text-white/40">To: {d.recipientName || 'Recipient'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-white">{d.packageDescription || 'Documents / Small box'}</p>
                      <p className="text-[11px] text-white/40">{d.packageWeight || '< 5 kg'}</p>
                    </td>
                    <td className="px-5 py-4 font-mono font-semibold text-white">
                      UGX {d.deliveryFee?.toLocaleString() || '15,000'}
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-white/10 text-white/70">
                        {d.status || 'dispatched'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {deliveries.length === 0 && !loading && (
              <div className="text-center py-16 text-sm text-white/50">No delivery orders logged yet.</div>
            )}
          </div>
        )}

        {/* Tab: Fleet */}
        {activeTab === 'fleet' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/[0.02] text-white/40 uppercase font-mono tracking-wider">
                <tr>
                  <th className="px-5 py-3">Driver Name</th>
                  <th className="px-5 py-3">Vehicle / Plate</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Rating</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/80">
                {fleet.map((f) => (
                  <tr key={f.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 font-medium text-white">{f.name || f.user?.name || 'Driver'}</td>
                    <td className="px-5 py-4 font-mono">
                      <p className="text-white">{f.vehicleModel || 'Toyota Premio'}</p>
                      <p className="text-[11px] text-white/40">{f.licensePlate || 'UBK 123X'}</p>
                    </td>
                    <td className="px-5 py-4 font-mono text-white/60">{f.phoneNumber || f.user?.phoneNumber || '-'}</td>
                    <td className="px-5 py-4 font-mono text-white font-semibold">★ {f.rating || 4.9}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                        f.isOnline ? 'bg-white text-black font-semibold' : 'bg-white/10 text-white/40'
                      }`}>
                        {f.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {fleet.length === 0 && !loading && (
              <div className="text-center py-16 text-sm text-white/50">No active drivers in fleet database.</div>
            )}
          </div>
        )}

        {/* Tab: Users */}
        {activeTab === 'users' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/[0.02] text-white/40 uppercase font-mono tracking-wider">
                <tr>
                  <th className="px-5 py-3">User ID</th>
                  <th className="px-5 py-3">Full Name</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/80">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 font-mono text-[11px] text-white/40">{u.id?.slice(0, 8)}...</td>
                    <td className="px-5 py-4 font-medium text-white">{u.name || 'Anonymous User'}</td>
                    <td className="px-5 py-4 font-mono text-white/60">{u.phoneNumber || '-'}</td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase border border-white/20 text-white/80">
                        {u.role || 'rider'}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-white/40 text-[11px]">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Recent'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && !loading && (
              <div className="text-center py-16 text-sm text-white/50">No registered users in database.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
