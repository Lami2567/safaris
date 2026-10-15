'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Search,
  Compass,
  Battery,
  Activity,
  Play,
  Pause,
  RotateCcw,
  X,
  Shield,
  Radio,
  Eye,
  Mail,
  Phone,
  Wallet,
  Calendar,
  Star,
  Copy,
  Check,
  ShieldCheck,
  UserCheck,
  ExternalLink,
  FileText
} from 'lucide-react';
import { api } from '@/lib/api';
import MapboxFleetMap from '@/components/MapboxFleetMap';

type OperationsTab = 'live_map' | 'approvals' | 'trips' | 'deliveries' | 'fleet' | 'users';

interface LiveDriver {
  id: string;
  full_name: string;
  phone: string;
  role: 'driver' | 'tour_guide';
  rating: number;
  is_online: boolean;
  is_available: boolean;
  current_lat: number;
  current_lng: number;
  heading: number;
  speed: number;
  accuracy: number;
  battery_level?: number;
  make: string;
  model: string;
  registration_plate: string;
  tier: string;
  active_trip_id?: string;
  active_trip_pickup?: string;
  active_trip_dest?: string;
  active_trip_status?: string;
  safari_leg?: string;
  last_ping?: string;
}

interface TelemetryPoint {
  id: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  accuracy: number;
  battery_level?: number;
  recorded_at: string;
}

export default function OperationsPage() {
  const [activeTab, setActiveTab] = useState<OperationsTab>('live_map');
  const [loading, setLoading] = useState(true);

  const [trips, setTrips] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [fleet, setFleet] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [liveFleet, setLiveFleet] = useState<LiveDriver[]>([]);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [applicantStatusFilter, setApplicantStatusFilter] = useState<'all' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'>('all');
  const [applicantTypeFilter, setApplicantTypeFilter] = useState<'all' | 'driver' | 'tour_guide'>('all');
  const [applicantSearchTerm, setApplicantSearchTerm] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectModalApp, setRejectModalApp] = useState<any | null>(null);
  const [viewApplicantModal, setViewApplicantModal] = useState<any | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [approvalFeedback, setApprovalFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleApproveApplicant = async (id: string) => {
    setActionLoadingId(id);
    setApprovalFeedback(null);
    try {
      await api.approveApplicant(id);
      setApprovalFeedback({ text: 'Applicant credentials successfully approved and activated for operations.', type: 'success' });
      await loadOperations();
    } catch (err: any) {
      setApprovalFeedback({ text: err.message || 'Approval failed', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectApplicant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalApp || !rejectionReasonInput.trim()) return;
    setActionLoadingId(rejectModalApp.id);
    setApprovalFeedback(null);
    try {
      await api.rejectApplicant(rejectModalApp.id, rejectionReasonInput.trim());
      setApprovalFeedback({ text: 'Application rejected.', type: 'success' });
      setRejectModalApp(null);
      setRejectionReasonInput('');
      await loadOperations();
    } catch (err: any) {
      setApprovalFeedback({ text: err.message || 'Rejection failed', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSuspendApplicant = async (userId: string) => {
    if (!confirm('Are you sure you want to suspend this account from operations?')) return;
    setActionLoadingId(userId);
    setApprovalFeedback(null);
    try {
      await api.suspendApplicant(userId, 'Suspended by admin review');
      setApprovalFeedback({ text: 'Account suspended from operations.', type: 'success' });
      await loadOperations();
    } catch (err: any) {
      setApprovalFeedback({ text: err.message || 'Suspension failed', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_trip' | 'available' | 'offline' | 'guides'>('all');
  const [selectedDriver, setSelectedDriver] = useState<LiveDriver | null>(null);
  const [mapEngine, setMapEngine] = useState<'mapbox' | 'radar'>('mapbox');

  // Registered Accounts Filter & Modal State
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'customer' | 'driver' | 'tour_guide' | 'admin'>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'verified' | 'pending'>('all');
  const [selectedUserModal, setSelectedUserModal] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const name = (u.full_name || u.name || '').toLowerCase();
      const phone = (u.phone || u.phoneNumber || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const id = (u.id || '').toLowerCase();
      const role = (u.role || 'customer').toLowerCase();
      const isVerified = (u.is_verified ?? u.isVerified) === true;

      const term = userSearchTerm.toLowerCase().trim();
      const matchesSearch = !term || name.includes(term) || phone.includes(term) || email.includes(term) || id.includes(term);
      const matchesRole = userRoleFilter === 'all' || role === userRoleFilter;
      const matchesStatus = userStatusFilter === 'all' || (userStatusFilter === 'verified' ? isVerified : !isVerified);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, userSearchTerm, userRoleFilter, userStatusFilter]);

  const filteredApplicants = useMemo(() => {
    return applicants.filter((app) => {
      const term = applicantSearchTerm.toLowerCase().trim();
      const name = (app.full_name || '').toLowerCase();
      const email = (app.email || '').toLowerCase();
      const phone = (app.phone || '').toLowerCase();
      const plate = (app.vehicle_plate || '').toLowerCase();
      const license = (app.license_number || '').toLowerCase();

      const matchesSearch = !term || name.includes(term) || email.includes(term) || phone.includes(term) || plate.includes(term) || license.includes(term);
      const matchesStatus = applicantStatusFilter === 'all' || app.status === applicantStatusFilter;
      const matchesType = applicantTypeFilter === 'all' || app.applicant_type === applicantTypeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [applicants, applicantSearchTerm, applicantStatusFilter, applicantTypeFilter]);

  // Playback State
  const [playbackOpen, setPlaybackOpen] = useState(false);
  const [playbackPoints, setPlaybackPoints] = useState<TelemetryPoint[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4>(1);
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadOperations = async () => {
    setLoading(true);
    try {
      const [t, d, f, u, lf, apps] = await Promise.all([
        api.getTrips().catch(() => []),
        api.getDeliveries().catch(() => []),
        api.getFleet().catch(() => []),
        api.getUsers().catch(() => []),
        api.getLiveFleet().catch(() => []),
        api.getApplicants().catch(() => []),
      ]);
      setTrips(t);
      setDeliveries(d);
      setFleet(f);
      setUsers(u);
      setLiveFleet(lf);
      setApplicants(apps || []);
    } catch (err) {
      console.error('[OperationsPage error]', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOperations();
    // 3.5s dedicated live fleet telemetry polling for smooth continuous vehicle movement
    const fleetTimer = setInterval(() => {
      api.getLiveFleet().then((lf) => {
        if (Array.isArray(lf)) {
          setLiveFleet(lf);
        }
      }).catch(() => {});
    }, 3500);

    const fullTimer = setInterval(loadOperations, 15000); // 15s full operations refresh
    return () => {
      clearInterval(fleetTimer);
      clearInterval(fullTimer);
    };
  }, []);

  // Filtered Live Fleet
  const filteredFleet = useMemo(() => {
    return liveFleet.filter((driver) => {
      const matchesSearch = 
        driver.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.registration_plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (driver.safari_leg && driver.safari_leg.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (driver.active_trip_dest && driver.active_trip_dest.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      if (statusFilter === 'in_trip') {
        return driver.is_online && (driver.active_trip_status === 'TRIP_STARTED' || driver.active_trip_status === 'DRIVER_ARRIVED');
      }
      if (statusFilter === 'available') {
        return driver.is_online && driver.is_available;
      }
      if (statusFilter === 'offline') {
        return !driver.is_online;
      }
      if (statusFilter === 'guides') {
        return driver.role === 'tour_guide';
      }
      return true;
    });
  }, [liveFleet, searchTerm, statusFilter]);

  // Handle Opening Playback & Audit Logging
  const openPlayback = async (driver: LiveDriver) => {
    setSelectedDriver(driver);
    setPlaybackOpen(true);
    setIsPlaying(false);
    setPlaybackIndex(0);

    // Secure Audit Log
    try {
      await api.logAudit({
        action: 'INSPECT_DRIVER_LOCATION_HISTORY',
        resourceType: 'driver',
        resourceId: driver.id,
        details: { driverName: driver.full_name, vehiclePlate: driver.registration_plate },
      });
    } catch (err) {
      console.warn('[Audit Log] Failed to log view action', err);
    }

    try {
      const res = await api.getDriverHistory(driver.id);
      if (res && res.points) {
        setPlaybackPoints(res.points);
      }
    } catch (err) {
      console.error('[Playback] Failed to load history', err);
    }
  };

  // Playback Timer
  useEffect(() => {
    if (isPlaying && playbackPoints.length > 0) {
      playbackTimerRef.current = setInterval(() => {
        setPlaybackIndex((prev) => {
          if (prev >= playbackPoints.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    } else {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    }
    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, playbackPoints, playbackSpeed]);

  // Coordinate Conversion helper for Uganda Vector Map
  // Uganda bounds roughly: Lat: -1.5 (South) to 4.2 (North), Lng: 29.5 (West) to 35.0 (East)
  const mapWidth = 800;
  const mapHeight = 520;
  const projectGeoToSvg = (lat: number, lng: number) => {
    const minLat = -1.6;
    const maxLat = 4.3;
    const minLng = 29.3;
    const maxLng = 35.2;

    const x = ((lng - minLng) / (maxLng - minLng)) * mapWidth;
    const y = ((maxLat - lat) / (maxLat - minLat)) * mapHeight;
    return { x: Math.max(20, Math.min(mapWidth - 20, x)), y: Math.max(20, Math.min(mapHeight - 20, y)) };
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 min-w-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Navigation className="w-7 h-7 text-white" />
            Live Dispatch & Fleet Operations
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Real-time GPS tracking, offline-synced telemetry, turn-by-turn navigation oversight, and route playback.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 bg-white/[0.02]">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span className="text-[11px] font-mono text-white/70">Live Telemetry (12s)</span>
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

      {/* Primary KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-[#111114] border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 font-medium">Online Drivers</span>
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
          </div>
          <p className="text-2xl font-bold text-white mt-2 font-mono">
            {liveFleet.filter(d => d.is_online).length}
          </p>
          <span className="text-[10px] text-white/40">Active in field</span>
        </div>

        <div className="bg-[#111114] border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 font-medium">Tour Guides</span>
            <Compass className="w-4 h-4 text-[#E5A93C]" />
          </div>
          <p className="text-2xl font-bold text-white mt-2 font-mono">
            {liveFleet.filter(d => d.role === 'tour_guide' && d.is_online).length}
          </p>
          <span className="text-[10px] text-white/40">Guiding safari tours</span>
        </div>

        <div className="bg-[#111114] border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 font-medium">Active Expeditions</span>
            <Radio className="w-4 h-4 text-[#E5A93C] animate-pulse" />
          </div>
          <p className="text-2xl font-bold text-[#E5A93C] mt-2 font-mono">
            {liveFleet.filter(d => d.active_trip_id).length}
          </p>
          <span className="text-[10px] text-white/40">In-transit & Safari legs</span>
        </div>

        <div className="bg-[#111114] border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 font-medium">Standby / Available</span>
            <span className="w-2 h-2 rounded-full bg-white/40" />
          </div>
          <p className="text-2xl font-bold text-white mt-2 font-mono">
            {liveFleet.filter(d => d.is_online && d.is_available).length}
          </p>
          <span className="text-[10px] text-white/40">Ready for dispatch</span>
        </div>

        <div className="bg-[#111114] border border-white/10 rounded-xl p-4 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 font-medium">Offline / Rest</span>
            <Clock className="w-4 h-4 text-white/30" />
          </div>
          <p className="text-2xl font-bold text-white/60 mt-2 font-mono">
            {liveFleet.filter(d => !d.is_online).length}
          </p>
          <span className="text-[10px] text-white/40">Off-duty or resting</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10">
        {[
          { id: 'live_map', label: 'Live Operations Map', icon: Radio, count: liveFleet.length },
          { id: 'approvals', label: 'Driver & Guide Approvals', icon: ShieldCheck, count: applicants.filter(a => a.status === 'PENDING_APPROVAL').length },
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

      {/* ========================================================================= */}
      {/* TAB: LIVE OPERATIONS MAP                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'live_map' && (
        <div className="space-y-6">
          {/* Controls Bar: Filters & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#111114] p-3 rounded-xl border border-white/10">
            {/* Filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {[
                { id: 'all', label: 'All Fleet' },
                { id: 'in_trip', label: 'In Trip / Safari' },
                { id: 'available', label: 'Available' },
                { id: 'guides', label: 'Tour Guides' },
                { id: 'offline', label: 'Offline' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id as any)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors whitespace-nowrap ${
                    statusFilter === f.id
                      ? 'bg-white text-black font-semibold'
                      : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Engine Selector & Search Input */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="flex items-center bg-black p-0.5 rounded-lg border border-white/15">
                <button
                  onClick={() => setMapEngine('mapbox')}
                  className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${
                    mapEngine === 'mapbox'
                      ? 'bg-[#E5A93C] text-black font-semibold'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Mapbox GL
                </button>
                <button
                  onClick={() => setMapEngine('radar')}
                  className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${
                    mapEngine === 'radar'
                      ? 'bg-white text-black font-semibold'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Vector Radar
                </button>
              </div>

              <div className="relative w-full md:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  placeholder="Search driver, plate, park..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-black border border-white/15 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
                />
              </div>
            </div>
          </div>

          {/* Map & Fleet Split Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {mapEngine === 'mapbox' ? (
              <div className="lg:col-span-8">
                <MapboxFleetMap
                  drivers={filteredFleet}
                  selectedDriver={selectedDriver}
                  onSelectDriver={(driver) => setSelectedDriver(driver)}
                  height="540px"
                />
              </div>
            ) : (
            /* Left 8 Cols: Interactive Vector Map */
            <div className="lg:col-span-8 bg-[#0C0D10] border border-white/15 rounded-2xl overflow-hidden shadow-2xl relative">
              {/* Map Title & Indicators */}
              <div className="absolute top-4 left-4 z-10 bg-black/80 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-lg flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#E5A93C] animate-pulse" />
                <span className="text-[11px] font-mono text-white/90">Uganda Fleet Telemetry Radar</span>
              </div>

              {/* Map Legend */}
              <div className="absolute top-4 right-4 z-10 bg-black/80 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-lg hidden sm:flex items-center gap-3 text-[10px] font-mono text-white/70">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#E5A93C]" />
                  <span>Safari / In Trip</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span>Available</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-white/40" />
                  <span>Offline</span>
                </div>
              </div>

              {/* SVG Vector Map of Uganda */}
              <div className="w-full overflow-hidden flex items-center justify-center p-2 sm:p-4">
                <svg
                  viewBox={`0 0 ${mapWidth} ${mapHeight}`}
                  className="w-full h-auto select-none"
                  style={{ maxHeight: '540px' }}
                >
                  <defs>
                    <radialGradient id="lakeVictoriaGradient" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#142838" />
                      <stop offset="100%" stopColor="#0B1520" />
                    </radialGradient>
                    <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Dark Map Base */}
                  <rect width={mapWidth} height={mapHeight} fill="#090A0C" />

                  {/* Geographic Grid / Latitude-Longitude Lines */}
                  <g stroke="#1A1C22" strokeWidth="0.5" strokeDasharray="3 3">
                    <line x1="0" y1="130" x2={mapWidth} y2="130" />
                    <line x1="0" y1="260" x2={mapWidth} y2="260" />
                    <line x1="0" y1="390" x2={mapWidth} y2="390" />
                    <line x1="200" y1="0" x2="200" y2={mapHeight} />
                    <line x1="400" y1="0" x2="400" y2={mapHeight} />
                    <line x1="600" y1="0" x2="600" y2={mapHeight} />
                  </g>

                  {/* Lake Victoria Shoreline Geometry */}
                  <path
                    d="M 380 430 Q 420 370, 480 390 Q 560 380, 620 440 Q 640 520, 520 520 Q 360 520, 380 430 Z"
                    fill="url(#lakeVictoriaGradient)"
                    stroke="#1E384D"
                    strokeWidth="1.5"
                  />
                  <text x="500" y="470" fill="#2E4F69" fontSize="12" fontFamily="monospace" textAnchor="middle">
                    LAKE VICTORIA
                  </text>

                  {/* Lake Kyoga */}
                  <ellipse cx="450" cy="240" rx="60" ry="18" fill="#0E1E2B" stroke="#1E384D" strokeWidth="1" />
                  <text x="450" y="244" fill="#2E4F69" fontSize="9" fontFamily="monospace" textAnchor="middle">
                    LAKE KYOGA
                  </text>

                  {/* Lake Albert */}
                  <ellipse cx="230" cy="200" rx="35" ry="90" fill="#0E1E2B" stroke="#1E384D" strokeWidth="1" transform="rotate(-30 230 200)" />
                  <text x="210" y="200" fill="#2E4F69" fontSize="9" fontFamily="monospace" textAnchor="middle">
                    LAKE ALBERT
                  </text>

                  {/* Key Uganda Highway Corridors */}
                  <g stroke="#22252E" strokeWidth="2.5" fill="none" strokeLinecap="round">
                    {/* Kampala -> Entebbe Expressway */}
                    <path d="M 445 350 Q 440 375, 430 405" stroke="#3A3F4D" strokeWidth="3" />
                    {/* Kampala -> Jinja Highway */}
                    <path d="M 445 350 Q 500 340, 560 335" stroke="#3A3F4D" strokeWidth="3" />
                    {/* Kampala -> Mbarara -> Bwindi Highway Corridor */}
                    <path d="M 445 350 Q 380 380, 320 410 Q 260 440, 220 460" stroke="#3A3F4D" strokeWidth="2.5" />
                    {/* Kampala -> Murchison Falls Corridor */}
                    <path d="M 445 350 Q 420 280, 380 180" stroke="#2B303C" strokeWidth="2.5" />
                  </g>

                  {/* National Parks & Tourism Destinations Highlights */}
                  {[
                    { name: 'Murchison Falls NP', lat: 2.25, lng: 31.85 },
                    { name: 'Kidepo Valley NP', lat: 3.90, lng: 33.85 },
                    { name: 'Queen Elizabeth NP', lat: -0.20, lng: 30.00 },
                    { name: 'Bwindi Impenetrable NP', lat: -1.05, lng: 29.70 },
                    { name: 'Lake Mburo NP', lat: -0.60, lng: 30.95 },
                    { name: 'Kampala CBD', lat: 0.3136, lng: 32.5811 },
                    { name: 'Entebbe Airport', lat: 0.0425, lng: 32.4435 },
                    { name: 'Jinja (Source of Nile)', lat: 0.44, lng: 33.20 },
                  ].map((loc, i) => {
                    const pt = projectGeoToSvg(loc.lat, loc.lng);
                    const isCapital = loc.name.includes('Kampala');
                    return (
                      <g key={i}>
                        <circle cx={pt.x} cy={pt.y} r={isCapital ? 4.5 : 2.5} fill={isCapital ? '#FFFFFF' : '#666666'} />
                        <text
                          x={pt.x + 6}
                          y={pt.y + 3}
                          fill={isCapital ? '#FFFFFF' : '#888888'}
                          fontSize={isCapital ? '10' : '8'}
                          fontWeight={isCapital ? 'bold' : 'normal'}
                          fontFamily="sans-serif"
                        >
                          {loc.name}
                        </text>
                      </g>
                    );
                  })}

                  {/* Vehicle / Driver Live Markers */}
                  {filteredFleet.map((driver) => {
                    const pt = projectGeoToSvg(driver.current_lat, driver.current_lng);
                    const isSelected = selectedDriver?.id === driver.id;
                    const isInTrip = driver.active_trip_id || driver.active_trip_status === 'TRIP_STARTED';
                    const markerColor = !driver.is_online ? '#666666' : isInTrip ? '#E5A93C' : '#10B981';

                    return (
                      <g
                        key={driver.id}
                        className="cursor-pointer transition-transform duration-200"
                        onClick={() => setSelectedDriver(driver)}
                      >
                        {/* Selected Ping Ring */}
                        {isSelected && (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="18"
                            fill="none"
                            stroke="#FFFFFF"
                            strokeWidth="1.5"
                            strokeDasharray="4 2"
                            className="animate-spin"
                          />
                        )}

                        {/* Pulse Glow for Active Vehicle */}
                        {driver.is_online && (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="12"
                            fill={markerColor}
                            opacity="0.25"
                            filter="url(#glowEffect)"
                          />
                        )}

                        {/* Outer Vehicle Circle */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isSelected ? 9 : 7}
                          fill={markerColor}
                          stroke="#0C0D10"
                          strokeWidth="2"
                        />

                        {/* Inner Core */}
                        <circle cx={pt.x} cy={pt.y} r="2.5" fill="#0C0D10" />

                        {/* Plate & Driver Tag */}
                        <g transform={`translate(${pt.x + 10}, ${pt.y - 4})`}>
                          <rect
                            x="0"
                            y="-8"
                            width="96"
                            height="16"
                            rx="3"
                            fill="#0A0B0E"
                            fillOpacity="0.85"
                            stroke={isSelected ? '#FFFFFF' : '#22252E'}
                            strokeWidth="0.8"
                          />
                          <text x="5" y="4" fill="#FFFFFF" fontSize="8" fontWeight="bold" fontFamily="monospace">
                            {driver.registration_plate || driver.full_name.split(' ')[0]}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Bottom Quick Coordinates Bar */}
              <div className="bg-[#090A0D] border-t border-white/10 px-4 py-2.5 flex items-center justify-between text-xs text-white/50">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-white/40" />
                  <span>Active Monitoring: {filteredFleet.length} units</span>
                </div>
                <div className="font-mono text-[11px]">
                  Projection: Uganda GRCh38 / Equirectangular
                </div>
              </div>
            </div>
            )}

            {/* Right 4 Cols: Driver Telemetry Inspector & Fleet Roster */}
            <div className="lg:col-span-4 space-y-4">
              {/* If a driver is selected, show Telemetry Inspector Card */}
              {selectedDriver ? (
                <div className="bg-[#111114] border border-white/20 rounded-2xl p-5 space-y-4 shadow-xl relative">
                  <button
                    onClick={() => setSelectedDriver(null)}
                    className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-white text-sm border border-white/15">
                      {selectedDriver.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        {selectedDriver.full_name}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase ${
                          selectedDriver.role === 'tour_guide' ? 'bg-[#E5A93C] text-black font-bold' : 'bg-white/10 text-white/70'
                        }`}>
                          {selectedDriver.role === 'tour_guide' ? 'Tour Guide' : 'Driver'}
                        </span>
                      </h3>
                      <p className="text-xs text-white/50 font-mono">{selectedDriver.phone}</p>
                    </div>
                  </div>

                  {/* Vehicle Information */}
                  <div className="bg-black/60 border border-white/10 rounded-xl p-3 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-white/40">Vehicle</span>
                      <span className="text-white font-medium">{selectedDriver.make} {selectedDriver.model}</span>
                    </div>
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-white/40">Registration</span>
                      <span className="text-[#E5A93C] font-semibold">{selectedDriver.registration_plate}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/40">Tier Category</span>
                      <span className="text-white/70 uppercase text-[10px] font-mono">{selectedDriver.tier}</span>
                    </div>
                  </div>

                  {/* Telemetry Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/40 border border-white/10 rounded-lg p-2.5">
                      <div className="flex items-center gap-1.5 text-white/40 text-[11px]">
                        <Activity className="w-3 h-3 text-white/50" />
                        <span>Current Speed</span>
                      </div>
                      <p className="text-base font-bold text-white font-mono mt-1">
                        {selectedDriver.speed ? `${selectedDriver.speed} km/h` : '0 km/h'}
                      </p>
                    </div>

                    <div className="bg-black/40 border border-white/10 rounded-lg p-2.5">
                      <div className="flex items-center gap-1.5 text-white/40 text-[11px]">
                        <Battery className="w-3 h-3 text-white/50" />
                        <span>Battery Level</span>
                      </div>
                      <p className="text-base font-bold text-white font-mono mt-1">
                        {selectedDriver.battery_level != null ? `${selectedDriver.battery_level}%` : '85%'}
                      </p>
                    </div>

                    <div className="bg-black/40 border border-white/10 rounded-lg p-2.5">
                      <div className="flex items-center gap-1.5 text-white/40 text-[11px]">
                        <MapPin className="w-3 h-3 text-white/50" />
                        <span>GPS Accuracy</span>
                      </div>
                      <p className="text-sm font-semibold text-white font-mono mt-1">
                        ± {selectedDriver.accuracy || 4.5} m
                      </p>
                    </div>

                    <div className="bg-black/40 border border-white/10 rounded-lg p-2.5">
                      <div className="flex items-center gap-1.5 text-white/40 text-[11px]">
                        <Clock className="w-3 h-3 text-white/50" />
                        <span>Last Telemetry</span>
                      </div>
                      <p className="text-xs font-semibold text-white/80 font-mono mt-1">
                        {selectedDriver.last_ping ? new Date(selectedDriver.last_ping).toLocaleTimeString() : 'Just now'}
                      </p>
                    </div>
                  </div>

                  {/* Active Expedition Leg if present */}
                  {(selectedDriver.safari_leg || selectedDriver.active_trip_dest) && (
                    <div className="bg-black border border-[#E5A93C]/30 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono text-[#E5A93C] font-semibold">
                        <Compass className="w-3 h-3" />
                        <span>Active Safari / Trip Route</span>
                      </div>
                      <p className="text-xs font-medium text-white mt-1.5">
                        {selectedDriver.safari_leg || `${selectedDriver.active_trip_pickup} → ${selectedDriver.active_trip_dest}`}
                      </p>
                    </div>
                  )}

                  {/* Inspect Route History Button */}
                  <button
                    onClick={() => openPlayback(selectedDriver)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white text-black font-semibold text-xs rounded-xl hover:bg-white/90 transition-colors shadow-lg"
                  >
                    <Eye className="w-4 h-4" />
                    Inspect Movement History & Route Playback
                  </button>
                </div>
              ) : (
                <div className="bg-[#111114] border border-white/10 rounded-2xl p-6 text-center text-white/40 space-y-2">
                  <Navigation className="w-8 h-8 mx-auto text-white/20" />
                  <p className="text-xs font-medium text-white/60">Select any driver on the map or list</p>
                  <p className="text-[11px] text-white/40">Inspect live GPS coordinates, battery, speed, and past journey trails.</p>
                </div>
              )}

              {/* Quick Fleet Roster List */}
              <div className="bg-[#111114] border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="text-xs font-bold text-white">Live Fleet Units</span>
                  <span className="text-[10px] font-mono text-white/40">{filteredFleet.length} units</span>
                </div>

                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {filteredFleet.map((driver) => {
                    const isSelected = selectedDriver?.id === driver.id;
                    const isInTrip = driver.active_trip_id || driver.active_trip_status === 'TRIP_STARTED';

                    return (
                      <div
                        key={driver.id}
                        onClick={() => setSelectedDriver(driver)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-white/10 border-white text-white'
                            : 'bg-black/40 border-white/10 hover:bg-white/[0.04] text-white/80'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-white flex items-center gap-2">
                            {driver.full_name}
                            {driver.role === 'tour_guide' && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-[#E5A93C]/20 text-[#E5A93C] font-mono">
                                GUIDE
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] font-mono text-white/40">
                            {driver.make} • {driver.registration_plate}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase ${
                            !driver.is_online ? 'bg-white/10 text-white/40' :
                            isInTrip ? 'bg-[#E5A93C] text-black font-bold' :
                            'bg-[#10B981]/20 text-[#10B981] font-semibold'
                          }`}>
                            {!driver.is_online ? 'OFFLINE' : isInTrip ? 'EXPEDITION' : 'ONLINE'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: DRIVER & TOUR GUIDE APPROVALS (careers.mumwesafarisuganda.com)      */}
      {/* ========================================================================= */}
      {activeTab === 'approvals' && (
        <div className="space-y-6">
          {/* Section Header & Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111114] border border-white/10 rounded-2xl p-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white">Driver & Tour Guide Recruitment Approvals</h2>
              </div>
              <p className="text-xs text-white/50">
                Official candidates originating from <span className="font-mono text-white/80">careers.mumwesafarisuganda.com</span>. Verification of permits and licenses is required before any operational dispatch.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs font-mono text-amber-300">
                {applicants.filter(a => a.status === 'PENDING_APPROVAL').length} Pending Action
              </div>
              <div className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs font-mono text-emerald-300">
                {applicants.filter(a => a.status === 'APPROVED').length} Approved Fleet
              </div>
            </div>
          </div>

          {/* Feedback banner */}
          {approvalFeedback && (
            <div className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              approvalFeedback.type === 'success' 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}>
              <div className="flex items-center gap-2">
                {approvalFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{approvalFeedback.text}</span>
              </div>
              <button onClick={() => setApprovalFeedback(null)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#111114] border border-white/10 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono uppercase text-white/40 mr-1">Status:</span>
              {(['all', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setApplicantStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                    applicantStatusFilter === st
                      ? 'bg-white text-black font-bold'
                      : 'border border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {st === 'all' ? 'All Records' : st.replace('_', ' ')}
                </button>
              ))}

              <span className="text-[11px] font-mono uppercase text-white/40 ml-3 mr-1">Role:</span>
              {(['all', 'driver', 'tour_guide'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setApplicantTypeFilter(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                    applicantTypeFilter === r
                      ? 'bg-white text-black font-bold'
                      : 'border border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {r === 'all' ? 'All Roles' : r === 'driver' ? 'Drivers' : 'Tour Guides'}
                </button>
              ))}
            </div>

            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Search name, phone, permit, plate..."
                value={applicantSearchTerm}
                onChange={(e) => setApplicantSearchTerm(e.target.value)}
                className="w-full bg-black/60 border border-white/15 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 font-mono"
              />
            </div>
          </div>

          {/* Applicants Table / Grid */}
          <div className="bg-[#111114] border border-white/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-white/40 font-mono text-[11px] uppercase">
                    <th className="py-3 px-4">Applicant</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Licensing / Credentials</th>
                    <th className="py-3 px-4">Assigned Vehicle / Specialties</th>
                    <th className="py-3 px-4">Experience</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredApplicants.map((app) => {
                    const isPending = app.status === 'PENDING_APPROVAL';
                    const isApproved = app.status === 'APPROVED';
                    const isRejected = app.status === 'REJECTED';
                    const isSuspended = app.status === 'SUSPENDED';
                    const isLoading = actionLoadingId === app.id || actionLoadingId === app.user_id;

                    return (
                      <tr key={app.id} className="hover:bg-white/[0.02] transition-colors">
                        {/* Name & Contact */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{app.full_name}</div>
                          <div className="text-[11px] text-white/50 font-mono mt-0.5">{app.phone}</div>
                          <div className="text-[11px] text-white/40 truncate max-w-[180px]" title={app.email}>{app.email}</div>
                        </td>

                        {/* Role */}
                        <td className="py-3.5 px-4">
                          {app.applicant_type === 'driver' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              <Car className="w-3 h-3" />
                              DRIVER
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <Compass className="w-3 h-3" />
                              TOUR GUIDE
                            </span>
                          )}
                        </td>

                        {/* Credentials */}
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          <div className="text-white/80">
                            {app.applicant_type === 'driver' ? 'Permit: ' : 'UWA License: '}
                            <span className="text-white font-semibold">{app.license_number || 'Under Review'}</span>
                          </div>
                          {app.national_id && (
                            <div className="text-white/40 text-[10px] mt-0.5">NIN: {app.national_id}</div>
                          )}
                        </td>

                        {/* Vehicle / Specialties */}
                        <td className="py-3.5 px-4">
                          {app.applicant_type === 'driver' ? (
                            app.vehicle_plate ? (
                              <div className="font-mono text-[11px]">
                                <span className="text-white font-medium">{app.vehicle_make} {app.vehicle_model}</span>
                                <span className="text-white/50 block text-[10px] uppercase font-bold">{app.vehicle_plate} ({app.vehicle_tier || 'go'})</span>
                              </div>
                            ) : (
                              <span className="text-white/40 text-[11px] font-mono">No vehicle linked</span>
                            )
                          ) : (
                            <div className="text-[11px] text-white/70 max-w-[220px]">
                              {Array.isArray(app.specialties) ? app.specialties.join(', ') : 'Uganda Safaris'}
                            </div>
                          )}
                        </td>

                        {/* Experience */}
                        <td className="py-3.5 px-4 font-mono text-[11px] text-white/80">
                          {app.experience_years || 0} years
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {isPending && (
                            <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              PENDING
                            </span>
                          )}
                          {isApproved && (
                            <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              APPROVED
                            </span>
                          )}
                          {isRejected && (
                            <div>
                              <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-red-500/15 text-red-300 border border-red-500/30">
                                REJECTED
                              </span>
                              {app.rejection_reason && (
                                <p className="text-[10px] text-red-300/70 mt-1 max-w-[150px] truncate" title={app.rejection_reason}>
                                  {app.rejection_reason}
                                </p>
                              )}
                            </div>
                          )}
                          {isSuspended && (
                            <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-white/10 text-white/50 border border-white/20">
                              SUSPENDED
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setViewApplicantModal(app)}
                              className="px-2.5 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 text-white/80 text-xs flex items-center gap-1 transition-colors"
                              title="Inspect Application & Documents"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Review
                            </button>
                            {isPending && (
                              <>
                                <button
                                  onClick={() => handleApproveApplicant(app.id)}
                                  disabled={isLoading}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                >
                                  {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                  Approve
                                </button>
                                <button
                                  onClick={() => setRejectModalApp(app)}
                                  disabled={isLoading}
                                  className="px-3 py-1.5 rounded-lg border border-red-500/40 hover:bg-red-500/10 text-red-300 text-xs flex items-center gap-1 transition-colors disabled:opacity-50"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  Reject
                                </button>
                              </>
                            )}

                            {isApproved && (
                              <button
                                onClick={() => handleSuspendApplicant(app.user_id || app.id)}
                                disabled={isLoading}
                                className="px-3 py-1.5 rounded-lg border border-amber-500/40 hover:bg-amber-500/10 text-amber-300 text-xs flex items-center gap-1 transition-colors disabled:opacity-50"
                              >
                                {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                                Suspend
                              </button>
                            )}

                            {(isRejected || isSuspended) && (
                              <button
                                onClick={() => handleApproveApplicant(app.id)}
                                disabled={isLoading}
                                className="px-3 py-1.5 rounded-lg border border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-1 transition-colors disabled:opacity-50"
                              >
                                {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                Re-Approve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredApplicants.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-white/40 font-mono text-xs">
                        No recruitment applicants found matching current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rejection Modal */}
          {rejectModalApp && (
            <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-[#111114] border border-white/20 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="text-sm font-bold text-white">Reject Recruitment Application</h3>
                  </div>
                  <button onClick={() => setRejectModalApp(null)} className="text-white/40 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-white/60">
                  Please provide a documented reason for rejecting <strong className="text-white">{rejectModalApp.full_name}</strong> ({rejectModalApp.applicant_type}). This notice will be archived in the admin audit log and notified to the applicant.
                </p>

                <form onSubmit={handleRejectApplicant} className="space-y-4">
                  <div>
                    <label className="text-[11px] font-mono text-white/50 uppercase">Mandatory Rejection Rationale</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="e.g. Invalid driving permit number, expired PSV license, or insufficient commercial experience..."
                      value={rejectionReasonInput}
                      onChange={(e) => setRejectionReasonInput(e.target.value)}
                      className="w-full mt-1 bg-black border border-white/20 rounded-xl p-3 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-red-400"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setRejectModalApp(null)}
                      className="px-4 py-2 text-xs text-white/60 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoadingId === rejectModalApp.id}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl flex items-center gap-2"
                    >
                      {actionLoadingId === rejectModalApp.id && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>Confirm Rejection</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Review Applicant & Documents Modal */}
          {viewApplicantModal && (
            <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-[#111114] border border-white/20 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400">
                      {viewApplicantModal.applicant_type === 'driver' ? <Car className="w-5 h-5" /> : <Compass className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">{viewApplicantModal.full_name}</h3>
                      <span className="text-[10px] font-mono text-white/50 uppercase">
                        {viewApplicantModal.applicant_type} • ID: {viewApplicantModal.id}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => setViewApplicantModal(null)} className="text-white/40 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-5 text-xs">
                  {/* Personal & Credential Grid */}
                  <div className="grid grid-cols-2 gap-3 bg-white/5 p-4 rounded-xl font-mono">
                    <div>
                      <span className="text-[10px] text-white/40 block">Phone Number</span>
                      <span className="text-white font-medium">{viewApplicantModal.phone}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/40 block">Email Address</span>
                      <span className="text-white font-medium truncate block">{viewApplicantModal.email}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/40 block">National ID (NIN)</span>
                      <span className="text-white font-medium">{viewApplicantModal.national_id || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/40 block">{viewApplicantModal.applicant_type === 'driver' ? 'Driving Permit' : 'UWA Accreditation'}</span>
                      <span className="text-amber-400 font-bold">{viewApplicantModal.license_number || 'Under Review'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/40 block">Experience</span>
                      <span className="text-white font-medium">{viewApplicantModal.experience_years || 0} years</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/40 block">Current Status</span>
                      <span className="text-amber-300 font-bold">{viewApplicantModal.status}</span>
                    </div>
                  </div>

                  {/* Vehicle or Guiding Specs */}
                  {viewApplicantModal.applicant_type === 'driver' && viewApplicantModal.vehicle_plate && (
                    <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
                      <h4 className="text-xs font-bold text-amber-400 uppercase font-mono mb-2">Attached Vehicle Specifications</h4>
                      <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                        <div><span className="text-white/40 block text-[10px]">Make / Model</span>{viewApplicantModal.vehicle_make} {viewApplicantModal.vehicle_model}</div>
                        <div><span className="text-white/40 block text-[10px]">Plate</span>{viewApplicantModal.vehicle_plate}</div>
                        <div><span className="text-white/40 block text-[10px]">Tier</span><span className="uppercase">{viewApplicantModal.vehicle_tier || 'go'}</span></div>
                      </div>
                    </div>
                  )}

                  {/* Attached Documents */}
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase font-mono mb-2">Submitted Verification Documents</h4>
                    {viewApplicantModal.documents && Object.keys(viewApplicantModal.documents).length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(viewApplicantModal.documents).map(([key, val]: [string, any]) => (
                          <div key={key} className="p-3 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                              <span className="capitalize font-mono text-[11px] text-white/80">{key.replace(/_/g, ' ')}</span>
                            </div>
                            <a
                              href={typeof val === 'string' ? val : '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-mono flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/40 font-mono text-xs italic">No digital document attachments linked to this application.</p>
                    )}
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="border-t border-white/10 p-4 flex items-center justify-between bg-black">
                  <button
                    onClick={() => setViewApplicantModal(null)}
                    className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white"
                  >
                    Close
                  </button>
                  <div className="flex items-center gap-2">
                    {viewApplicantModal.status === 'PENDING_APPROVAL' && (
                      <>
                        <button
                          onClick={() => {
                            const id = viewApplicantModal.id;
                            setViewApplicantModal(null);
                            handleApproveApplicant(id);
                          }}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Approve Operator
                        </button>
                        <button
                          onClick={() => {
                            const app = viewApplicantModal;
                            setViewApplicantModal(null);
                            setRejectModalApp(app);
                          }}
                          className="px-4 py-2 rounded-xl border border-red-500/40 hover:bg-red-500/10 text-red-300 text-xs flex items-center gap-1.5"
                        >
                          <X className="w-4 h-4" />
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {playbackOpen && selectedDriver && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111114] border border-white/20 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-[#E5A93C]" />
                  Movement History & Route Playback: {selectedDriver.full_name}
                </h3>
                <p className="text-xs text-white/40 mt-0.5 font-mono">
                  Vehicle: {selectedDriver.make} {selectedDriver.model} ({selectedDriver.registration_plate})
                </p>
              </div>
              <button
                onClick={() => setPlaybackOpen(false)}
                className="text-white/40 hover:text-white p-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Playback Canvas */}
            <div className="px-6 py-2">
              <div className="bg-[#090A0C] border border-white/10 rounded-xl p-4 relative overflow-hidden">
                <svg viewBox="0 0 700 280" className="w-full h-auto">
                  {/* Road Grid */}
                  <g stroke="#1A1C22" strokeWidth="0.5" strokeDasharray="3 3">
                    <line x1="0" y1="70" x2="700" y2="70" />
                    <line x1="0" y1="140" x2="700" y2="140" />
                    <line x1="0" y1="210" x2="700" y2="210" />
                  </g>

                  {/* Route Breadcrumbs Trail */}
                  {playbackPoints.length > 1 && (
                    <polyline
                      points={playbackPoints.map((p, idx) => {
                        const pt = projectGeoToSvg(p.lat, p.lng);
                        return `${pt.x},${pt.y * 0.55}`;
                      }).join(' ')}
                      fill="none"
                      stroke="#E5A93C"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Animated Current Playback Point */}
                  {playbackPoints.length > 0 && (
                    (() => {
                      const curr = playbackPoints[playbackIndex] || playbackPoints[0];
                      const pt = projectGeoToSvg(curr.lat, curr.lng);
                      return (
                        <g transform={`translate(${pt.x}, ${pt.y * 0.55})`}>
                          <circle r="12" fill="#E5A93C" opacity="0.3" />
                          <circle r="6" fill="#E5A93C" stroke="#FFFFFF" strokeWidth="2" />
                          <rect x="8" y="-12" width="70" height="18" rx="3" fill="#000000" fillOpacity="0.8" stroke="#FFFFFF" strokeWidth="0.5" />
                          <text x="12" y="0" fill="#FFFFFF" fontSize="9" fontFamily="monospace">
                            {curr.speed || 0} km/h
                          </text>
                        </g>
                      );
                    })()
                  )}
                </svg>
              </div>
            </div>

            {/* Playback Timeline & Controls */}
            <div className="p-6 border-t border-white/10 space-y-4">
              {/* Timeline Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-white/50">
                  <span>Step {playbackIndex + 1} of {playbackPoints.length || 1}</span>
                  <span>
                    {playbackPoints[playbackIndex]?.recorded_at
                      ? new Date(playbackPoints[playbackIndex].recorded_at).toLocaleTimeString()
                      : '00:00'}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, playbackPoints.length - 1)}
                  value={playbackIndex}
                  onChange={(e) => setPlaybackIndex(parseInt(e.target.value))}
                  className="w-full accent-[#E5A93C] cursor-pointer"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-black text-xs font-bold rounded-lg hover:bg-white/90 transition-colors"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>

                  <button
                    onClick={() => {
                      setIsPlaying(false);
                      setPlaybackIndex(0);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 border border-white/20 text-white/80 text-xs rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                </div>

                {/* Speed Multiplier */}
                <div className="flex items-center gap-1 bg-black p-1 rounded-lg border border-white/10">
                  {[1, 2, 4].map((s) => (
                    <button
                      key={s}
                      onClick={() => setPlaybackSpeed(s as any)}
                      className={`px-2.5 py-1 text-xs rounded font-mono ${
                        playbackSpeed === s ? 'bg-white text-black font-bold' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* OTHER TABS: TRIPS, DELIVERIES, FLEET, USERS                                */}
      {/* ========================================================================= */}
      {activeTab !== 'live_map' && (
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

          {/* Tab: Users / Registered Accounts */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* Registered Accounts KPI Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#111114] p-3.5 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Total Accounts</span>
                    <Users className="w-4 h-4 text-white/40" />
                  </div>
                  <p className="text-xl font-bold font-mono text-white mt-1.5">{users.length}</p>
                  <span className="text-[10px] text-white/40">In permanent database</span>
                </div>

                <div className="bg-[#111114] p-3.5 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Customers / Riders</span>
                    <Car className="w-4 h-4 text-emerald-400/60" />
                  </div>
                  <p className="text-xl font-bold font-mono text-emerald-400 mt-1.5">
                    {users.filter((u) => (u.role || 'customer') === 'customer').length}
                  </p>
                  <span className="text-[10px] text-white/40">Registered travelers</span>
                </div>

                <div className="bg-[#111114] p-3.5 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Drivers & Guides</span>
                    <Compass className="w-4 h-4 text-amber-400/60" />
                  </div>
                  <p className="text-xl font-bold font-mono text-amber-400 mt-1.5">
                    {users.filter((u) => u.role === 'driver' || u.role === 'tour_guide').length}
                  </p>
                  <span className="text-[10px] text-white/40">Service partners</span>
                </div>

                <div className="bg-[#111114] p-3.5 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Wallet Holdings</span>
                    <Wallet className="w-4 h-4 text-[#E5A93C]/70" />
                  </div>
                  <p className="text-xl font-bold font-mono text-[#E5A93C] mt-1.5">
                    UGX {users.reduce((s, u) => s + (Number(u.wallet_balance_ugx ?? u.walletBalanceUGX ?? 0) || 0), 0).toLocaleString()}
                  </p>
                  <span className="text-[10px] text-white/40">Total customer balance</span>
                </div>
              </div>

              {/* Filter & Search Toolbar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#111114] p-3 rounded-xl border border-white/10">
                {/* Role Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                  {[
                    { id: 'all', label: 'All Accounts', count: users.length },
                    { id: 'customer', label: 'Customers', count: users.filter((u) => (u.role || 'customer') === 'customer').length },
                    { id: 'driver', label: 'Drivers', count: users.filter((u) => u.role === 'driver').length },
                    { id: 'tour_guide', label: 'Tour Guides', count: users.filter((u) => u.role === 'tour_guide').length },
                    { id: 'admin', label: 'Admins', count: users.filter((u) => u.role === 'admin').length },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setUserRoleFilter(f.id as any)}
                      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                        userRoleFilter === f.id
                          ? 'bg-white text-black font-semibold'
                          : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      <span>{f.label}</span>
                      <span className={`text-[10px] px-1 py-0.2 rounded ${
                        userRoleFilter === f.id ? 'bg-black/20 text-black font-bold' : 'bg-white/10 text-white/50'
                      }`}>
                        {f.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Status Filter & Search Input */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <select
                    value={userStatusFilter}
                    onChange={(e) => setUserStatusFilter(e.target.value as any)}
                    className="bg-black border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white/80 focus:outline-none focus:border-white/40"
                  >
                    <option value="all">All Status</option>
                    <option value="verified">Verified Only</option>
                    <option value="pending">Pending OTP</option>
                  </select>

                  <div className="relative w-full md:w-72">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      type="text"
                      placeholder="Search name, phone, email, or ID..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="w-full bg-black border border-white/15 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0C0D10]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 bg-white/[0.02] text-white/50 uppercase font-mono tracking-wider text-[11px]">
                    <tr>
                      <th className="px-5 py-3.5">User / Full Name</th>
                      <th className="px-5 py-3.5">Phone Number</th>
                      <th className="px-5 py-3.5">Email Address</th>
                      <th className="px-5 py-3.5">Role</th>
                      <th className="px-5 py-3.5">Wallet Balance</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">Activity</th>
                      <th className="px-5 py-3.5">Joined Date</th>
                      <th className="px-5 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-white/80">
                    {filteredUsers.map((u) => {
                      const fullName = u.full_name || u.name || 'Anonymous User';
                      const phone = u.phone || u.phoneNumber || '-';
                      const email = u.email || '-';
                      const role = u.role || 'customer';
                      const walletBalance = Number(u.wallet_balance_ugx ?? u.walletBalanceUGX ?? 0);
                      const isVerified = (u.is_verified ?? u.isVerified) === true;
                      const tripsCount = u.total_trips ?? u.totalTrips ?? 0;
                      const rating = Number(u.rating ?? 5.0).toFixed(1);
                      const createdAt = u.created_at || u.createdAt;

                      // Initials for avatar
                      const initials = fullName
                        .split(' ')
                        .map((n: string) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase() || 'U';

                      return (
                        <tr
                          key={u.id}
                          onClick={() => setSelectedUserModal(u)}
                          className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                        >
                          {/* User Name & Full ID */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                role === 'admin'
                                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                  : role === 'driver'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : role === 'tour_guide'
                                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              }`}>
                                {initials}
                              </div>
                              <div>
                                <p className="font-semibold text-white group-hover:text-[#E5A93C] transition-colors">
                                  {fullName}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="font-mono text-[10px] text-white/40">{u.id}</span>
                                  <button
                                    onClick={(e) => handleCopyId(u.id, e)}
                                    title="Copy User ID"
                                    className="text-white/30 hover:text-white transition-colors"
                                  >
                                    {copiedId === u.id ? (
                                      <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Phone */}
                          <td className="px-5 py-4 font-mono text-white/80">
                            {phone !== '-' ? (
                              <a
                                href={`tel:${phone.replace(/\s+/g, '')}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5 hover:text-white transition-colors"
                              >
                                <Phone className="w-3.5 h-3.5 text-white/40" />
                                <span>{phone}</span>
                              </a>
                            ) : (
                              <span className="text-white/30">-</span>
                            )}
                          </td>

                          {/* Email */}
                          <td className="px-5 py-4 text-white/80">
                            {email !== '-' ? (
                              <a
                                href={`mailto:${email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5 hover:text-white transition-colors"
                              >
                                <Mail className="w-3.5 h-3.5 text-white/40" />
                                <span className="font-mono text-[11px] truncate max-w-[200px]" title={email}>
                                  {email}
                                </span>
                              </a>
                            ) : (
                              <span className="text-white/30">-</span>
                            )}
                          </td>

                          {/* Role */}
                          <td className="px-5 py-4">
                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-mono uppercase font-semibold border ${
                              role === 'admin'
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                                : role === 'driver'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : role === 'tour_guide'
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            }`}>
                              {role === 'customer'
                                ? 'Customer'
                                : role === 'driver'
                                ? 'Safari Driver'
                                : role === 'tour_guide'
                                ? 'Tour Guide'
                                : role === 'admin'
                                ? 'Super Admin'
                                : role}
                            </span>
                          </td>

                          {/* Wallet Balance */}
                          <td className="px-5 py-4 font-mono font-semibold text-emerald-400">
                            UGX {walletBalance.toLocaleString()}
                          </td>

                          {/* Verification Status */}
                          <td className="px-5 py-4">
                            {isVerified ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" />
                                Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Clock className="w-3 h-3" />
                                Pending OTP
                              </span>
                            )}
                          </td>

                          {/* Activity & Rating */}
                          <td className="px-5 py-4 font-mono text-[11px]">
                            <p className="text-white/80">{tripsCount} trips</p>
                            <p className="text-[#E5A93C] text-[10px]">★ {rating}</p>
                          </td>

                          {/* Joined Date */}
                          <td className="px-5 py-4 font-mono text-white/50 text-[11px] whitespace-nowrap">
                            {createdAt ? (
                              <div>
                                <p className="text-white/80">
                                  {new Date(createdAt).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </p>
                                <p className="text-[10px] text-white/40">
                                  {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            ) : (
                              'Recent'
                            )}
                          </td>

                          {/* Action */}
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedUserModal(u);
                              }}
                              className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors inline-flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {filteredUsers.length === 0 && !loading && (
                  <div className="text-center py-16 text-sm text-white/50">
                    {userSearchTerm || userRoleFilter !== 'all' || userStatusFilter !== 'all'
                      ? 'No registered accounts match your current filter.'
                      : 'No registered accounts found in the database.'}
                  </div>
                )}
              </div>

              {/* Showing count footer */}
              <div className="flex items-center justify-between text-xs text-white/40 px-1 font-mono">
                <span>Showing {filteredUsers.length} of {users.length} registered accounts</span>
                <span>SAFARIS Identity Engine • PostgreSQL Relational Store</span>
              </div>
            </div>
          )}

          {/* User Details Modal */}
          {selectedUserModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
              onClick={() => setSelectedUserModal(null)}
            >
              <div
                className="bg-[#111114] border border-white/15 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-sm text-white">
                      {(selectedUserModal.full_name || selectedUserModal.name || 'User')
                        .split(' ')
                        .map((n: string) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-base">
                        {selectedUserModal.full_name || selectedUserModal.name || 'Account Details'}
                      </h3>
                      <p className="text-xs text-white/40 font-mono">{selectedUserModal.id}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedUserModal(null)}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-5 space-y-4 text-xs">
                  {/* Status Banner */}
                  <div className={`p-3 rounded-xl border flex items-center justify-between ${
                    (selectedUserModal.is_verified ?? selectedUserModal.isVerified) === true
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  }`}>
                    <div className="flex items-center gap-2">
                      {(selectedUserModal.is_verified ?? selectedUserModal.isVerified) === true ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                      <span className="font-semibold">
                        {(selectedUserModal.is_verified ?? selectedUserModal.isVerified) === true
                          ? 'Verified & Active Account'
                          : 'Pending Email OTP Confirmation'}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-black/40">
                      {selectedUserModal.role || 'customer'}
                    </span>
                  </div>

                  {/* Detail Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/50 p-3 rounded-xl border border-white/10">
                      <span className="text-white/40 block mb-1">Phone Number</span>
                      <p className="font-mono text-white text-sm">
                        {selectedUserModal.phone || selectedUserModal.phoneNumber || 'Not provided'}
                      </p>
                    </div>

                    <div className="bg-black/50 p-3 rounded-xl border border-white/10">
                      <span className="text-white/40 block mb-1">Email Address</span>
                      <p className="font-mono text-white text-sm truncate" title={selectedUserModal.email}>
                        {selectedUserModal.email || 'Not provided'}
                      </p>
                    </div>

                    <div className="bg-black/50 p-3 rounded-xl border border-white/10">
                      <span className="text-white/40 block mb-1">Wallet Balance</span>
                      <p className="font-mono font-bold text-emerald-400 text-sm">
                        UGX {Number(selectedUserModal.wallet_balance_ugx ?? selectedUserModal.walletBalanceUGX ?? 0).toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-black/50 p-3 rounded-xl border border-white/10">
                      <span className="text-white/40 block mb-1">Total Trips & Rating</span>
                      <p className="font-mono text-white text-sm">
                        {selectedUserModal.total_trips ?? selectedUserModal.totalTrips ?? 0} trips · ★{' '}
                        {Number(selectedUserModal.rating ?? 5.0).toFixed(1)}
                      </p>
                    </div>
                  </div>

                  {/* Full System IDs */}
                  <div className="bg-black/50 p-3 rounded-xl border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white/40">Unique User ID:</span>
                      <div className="flex items-center gap-1.5 font-mono text-white">
                        <span>{selectedUserModal.id}</span>
                        <button
                          onClick={() => handleCopyId(selectedUserModal.id)}
                          className="text-white/40 hover:text-white"
                        >
                          {copiedId === selectedUserModal.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/40">Account Created:</span>
                      <span className="font-mono text-white/80">
                        {selectedUserModal.created_at || selectedUserModal.createdAt
                          ? new Date(selectedUserModal.created_at || selectedUserModal.createdAt).toLocaleString()
                          : 'Recent'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/40">Database Engine:</span>
                      <span className="font-mono text-emerald-400">PostgreSQL (AWS Lightsail)</span>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end p-4 border-t border-white/10 bg-white/[0.02]">
                  <button
                    onClick={() => setSelectedUserModal(null)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-white text-black hover:bg-white/90 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
