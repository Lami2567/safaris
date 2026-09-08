'use client';

import React, { useState, useEffect } from 'react';
import { 
  Compass, 
  MapPin, 
  Package as PackageIcon, 
  UserCheck, 
  CalendarCheck, 
  Plus, 
  Trash2, 
  Edit3, 
  RefreshCw, 
  Search, 
  CheckCircle2, 
  Clock, 
  X,
  AlertCircle
} from 'lucide-react';
import { api } from '@/lib/api';
import { ImagePlaceholder } from '@/components/ImagePlaceholder';

type Tab = 'destinations' | 'packages' | 'guides' | 'bookings';

export default function TourismPage() {
  const [activeTab, setActiveTab] = useState<Tab>('destinations');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [destinations, setDestinations] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [guides, setGuides] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Form states
  const [destForm, setDestForm] = useState({
    name: '',
    category: 'national_park',
    description: '',
    imageUrl: '',
    latitude: 0.3476,
    longitude: 32.5825,
    distanceFromKampala: '300 km',
    travelDuration: '5 hours',
    rating: 4.8,
    isPopular: true,
  });

  const [pkgForm, setPkgForm] = useState({
    destinationId: '',
    title: '',
    durationDays: 3,
    priceUgx: 1200000,
    priceUsd: 350,
    description: '',
    imageUrl: '',
    isFeatured: true,
  });

  const [guideForm, setGuideForm] = useState({
    name: '',
    phone: '',
    email: '',
    languages: 'English, Swahili, Luganda',
    specialties: 'Wildlife, Birding, Gorillas',
    yearsOfExperience: 5,
    rating: 4.9,
    pricePerDayUgx: 150000,
    pricePerDayUsd: 45,
    isCertified: true,
    isAvailable: true,
    avatarUrl: '',
    bio: '',
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, p, g, b] = await Promise.all([
        api.getDestinations().catch(() => []),
        api.getPackages().catch(() => []),
        api.getGuides().catch(() => []),
        api.getBookings().catch(() => []),
      ]);
      setDestinations(d);
      setPackages(p);
      setGuides(g);
      setBookings(b);
    } catch (err: any) {
      setError(err.message || 'Failed to load tourism data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (modalMode === 'create') {
        await api.createDestination(destForm);
      } else {
        await api.updateDestination(selectedItem.id, destForm);
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      alert(`Error saving destination: ${err.message}`);
    }
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (modalMode === 'create') {
        await api.createPackage(pkgForm);
      } else {
        await api.updatePackage(selectedItem.id, pkgForm);
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      alert(`Error saving package: ${err.message}`);
    }
  };

  const handleSaveGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...guideForm,
        languages: typeof guideForm.languages === 'string' ? guideForm.languages.split(',').map(s => s.trim()) : guideForm.languages,
        specialties: typeof guideForm.specialties === 'string' ? guideForm.specialties.split(',').map(s => s.trim()) : guideForm.specialties,
      };
      if (modalMode === 'create') {
        await api.createGuide(payload);
      } else {
        await api.updateGuide(selectedItem.id, payload);
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      alert(`Error saving guide: ${err.message}`);
    }
  };

  const handleDelete = async (type: Tab, id: string) => {
    if (!confirm(`Are you sure you want to delete this ${type.slice(0, -1)}?`)) return;
    try {
      if (type === 'destinations') await api.deleteDestination(id);
      if (type === 'packages') await api.deletePackage(id);
      if (type === 'guides') await api.deleteGuide(id);
      loadData();
    } catch (err: any) {
      alert(`Error deleting: ${err.message}`);
    }
  };

  const handleUpdateBookingStatus = async (id: string, status: string) => {
    try {
      await api.updateBookingStatus(id, status);
      loadData();
    } catch (err: any) {
      alert(`Failed to update booking status: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Compass className="w-7 h-7 text-white" />
            Tourism & Safari Management
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Dynamic control for destinations, curated packages, certified tour guides, and customer bookings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-xs border border-white/20 rounded-md hover:bg-white/10 text-white/80 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync Data
          </button>
          {activeTab !== 'bookings' && (
            <button
              onClick={() => {
                setModalMode('create');
                setSelectedItem(null);
                if (activeTab === 'packages' && destinations.length > 0) {
                  setPkgForm(prev => ({ ...prev, destinationId: destinations[0].id }));
                }
                setShowModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white text-black rounded-md hover:bg-white/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add {activeTab === 'destinations' ? 'Destination' : activeTab === 'packages' ? 'Package' : 'Guide'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10">
        {[
          { id: 'destinations', label: 'Destinations', icon: MapPin, count: destinations.length },
          { id: 'packages', label: 'Tour Packages', icon: PackageIcon, count: packages.length },
          { id: 'guides', label: 'Certified Guides', icon: UserCheck, count: guides.length },
          { id: 'bookings', label: 'Bookings & Enquiries', icon: CalendarCheck, count: bookings.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
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

      {/* Tab: Destinations */}
      {activeTab === 'destinations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {destinations.map((dest) => (
              <div
                key={dest.id}
                className="bg-black border border-white/15 rounded-xl p-5 hover:border-white/40 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="mb-4">
                    <ImagePlaceholder
                      label="Destination Banner"
                      aspectRatio="16:9"
                      value={dest.imageUrl}
                    />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded border border-white/20 text-white/60">
                        {dest.category?.replace('_', ' ') || 'National Park'}
                      </span>
                      <h3 className="text-lg font-bold text-white mt-2">{dest.name}</h3>
                    </div>
                    {dest.isPopular && (
                      <span className="text-[10px] bg-white text-black font-semibold px-2 py-0.5 rounded">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/60 line-clamp-3 mt-2 leading-relaxed">
                    {dest.description || 'No description provided yet.'}
                  </p>
                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-white/50 font-mono">
                    <span>{dest.distanceFromKampala || '300 km'}</span>
                    <span>{dest.travelDuration || '5 hrs'}</span>
                    <span>★ {dest.rating || 4.8}</span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setSelectedItem(dest);
                      setDestForm({
                        name: dest.name || '',
                        category: dest.category || 'national_park',
                        description: dest.description || '',
                        imageUrl: dest.imageUrl || '',
                        latitude: dest.latitude || 0.3476,
                        longitude: dest.longitude || 32.5825,
                        distanceFromKampala: dest.distanceFromKampala || '300 km',
                        travelDuration: dest.travelDuration || '5 hours',
                        rating: dest.rating || 4.8,
                        isPopular: dest.isPopular ?? true,
                      });
                      setModalMode('edit');
                      setShowModal(true);
                    }}
                    className="p-2 border border-white/15 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete('destinations', dest.id)}
                    className="p-2 border border-white/15 rounded-md hover:border-red-500/50 hover:bg-red-500/10 text-white/70 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {destinations.length === 0 && !loading && (
            <div className="text-center py-16 border border-dashed border-white/15 rounded-xl">
              <MapPin className="w-10 h-10 text-white/30 mx-auto mb-3" />
              <p className="text-sm text-white/60">No destinations configured yet.</p>
              <button
                onClick={() => {
                  setModalMode('create');
                  setShowModal(true);
                }}
                className="mt-4 px-4 py-2 bg-white text-black text-xs font-semibold rounded-md hover:bg-white/90"
              >
                Add First Destination
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Tour Packages */}
      {activeTab === 'packages' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="bg-black border border-white/15 rounded-xl p-5 hover:border-white/40 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="mb-4">
                    <ImagePlaceholder
                      label="Package Highlight"
                      aspectRatio="16:9"
                      value={pkg.imageUrl}
                    />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-white">{pkg.title}</h3>
                    {pkg.isFeatured && (
                      <span className="text-[10px] bg-white text-black font-semibold px-2 py-0.5 rounded">
                        Featured
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 mt-1">
                    Destination: {destinations.find(d => d.id === pkg.destinationId)?.name || pkg.destination?.name || 'Uganda Safari'}
                  </p>
                  <p className="text-xs text-white/60 line-clamp-3 mt-3 leading-relaxed">
                    {pkg.description || 'Custom curated wildlife safari itinerary.'}
                  </p>
                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider font-mono">Duration</p>
                      <p className="text-xs text-white font-medium">{pkg.durationDays} Days</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-white/40 uppercase tracking-wider font-mono">Pricing</p>
                      <p className="text-xs text-white font-semibold font-mono">
                        UGX {pkg.priceUgx?.toLocaleString()} <span className="text-white/40">(${pkg.priceUsd})</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setSelectedItem(pkg);
                      setPkgForm({
                        destinationId: pkg.destinationId || '',
                        title: pkg.title || '',
                        durationDays: pkg.durationDays || 3,
                        priceUgx: pkg.priceUgx || 1200000,
                        priceUsd: pkg.priceUsd || 350,
                        description: pkg.description || '',
                        imageUrl: pkg.imageUrl || '',
                        isFeatured: pkg.isFeatured ?? true,
                      });
                      setModalMode('edit');
                      setShowModal(true);
                    }}
                    className="p-2 border border-white/15 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete('packages', pkg.id)}
                    className="p-2 border border-white/15 rounded-md hover:border-red-500/50 hover:bg-red-500/10 text-white/70 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {packages.length === 0 && !loading && (
            <div className="text-center py-16 border border-dashed border-white/15 rounded-xl">
              <PackageIcon className="w-10 h-10 text-white/30 mx-auto mb-3" />
              <p className="text-sm text-white/60">No tour packages created yet.</p>
              <button
                onClick={() => {
                  setModalMode('create');
                  setShowModal(true);
                }}
                className="mt-4 px-4 py-2 bg-white text-black text-xs font-semibold rounded-md hover:bg-white/90"
              >
                Create First Package
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Certified Guides */}
      {activeTab === 'guides' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {guides.map((g) => (
              <div
                key={g.id}
                className="bg-black border border-white/15 rounded-xl p-5 hover:border-white/40 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="mb-4">
                    <ImagePlaceholder
                      label="Guide Portrait"
                      aspectRatio="1:1"
                      value={g.avatarUrl}
                    />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-white">{g.name}</h3>
                      <p className="text-xs text-white/40 font-mono mt-0.5">{g.phone || 'No phone'}</p>
                    </div>
                    {g.isCertified && (
                      <span className="text-[10px] bg-white text-black font-semibold px-2 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Certified
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-white/60 line-clamp-2 mt-3 leading-relaxed">
                    {g.bio || 'Experienced UWA registered safari guide with extensive flora and fauna knowledge.'}
                  </p>

                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-white/50">
                      <span>Languages:</span>
                      <span className="text-white text-right font-mono">
                        {Array.isArray(g.languages) ? g.languages.join(', ') : g.languages || 'English'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-white/50">
                      <span>Experience:</span>
                      <span className="text-white font-mono">{g.yearsOfExperience || 5} Years</span>
                    </div>
                    <div className="flex items-center justify-between text-white/50">
                      <span>Daily Fee:</span>
                      <span className="text-white font-mono font-semibold">
                        UGX {g.pricePerDayUgx?.toLocaleString()} / day
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setSelectedItem(g);
                      setGuideForm({
                        name: g.name || '',
                        phone: g.phone || '',
                        email: g.email || '',
                        languages: Array.isArray(g.languages) ? g.languages.join(', ') : (g.languages || ''),
                        specialties: Array.isArray(g.specialties) ? g.specialties.join(', ') : (g.specialties || ''),
                        yearsOfExperience: g.yearsOfExperience || 5,
                        rating: g.rating || 4.9,
                        pricePerDayUgx: g.pricePerDayUgx || 150000,
                        pricePerDayUsd: g.pricePerDayUsd || 45,
                        isCertified: g.isCertified ?? true,
                        isAvailable: g.isAvailable ?? true,
                        avatarUrl: g.avatarUrl || '',
                        bio: g.bio || '',
                      });
                      setModalMode('edit');
                      setShowModal(true);
                    }}
                    className="p-2 border border-white/15 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete('guides', g.id)}
                    className="p-2 border border-white/15 rounded-md hover:border-red-500/50 hover:bg-red-500/10 text-white/70 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {guides.length === 0 && !loading && (
            <div className="text-center py-16 border border-dashed border-white/15 rounded-xl">
              <UserCheck className="w-10 h-10 text-white/30 mx-auto mb-3" />
              <p className="text-sm text-white/60">No certified guides registered yet.</p>
              <button
                onClick={() => {
                  setModalMode('create');
                  setShowModal(true);
                }}
                className="mt-4 px-4 py-2 bg-white text-black text-xs font-semibold rounded-md hover:bg-white/90"
              >
                Register First Guide
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Bookings */}
      {activeTab === 'bookings' && (
        <div className="border border-white/15 rounded-xl overflow-hidden bg-black">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/[0.02] text-white/40 uppercase font-mono tracking-wider">
                <tr>
                  <th className="px-5 py-3">Booking ID</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Destination / Package</th>
                  <th className="px-5 py-3">Dates</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/80">
                {bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 font-mono text-[11px] text-white/50">{b.id?.slice(0, 8)}...</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{b.user?.name || b.contactName || 'Guest User'}</p>
                      <p className="text-[11px] text-white/40 font-mono">{b.contactPhone || b.user?.phoneNumber || '-'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{b.package?.title || b.destination?.name || 'Custom Safari'}</p>
                      <p className="text-[11px] text-white/40">{b.peopleCount || 2} People</p>
                    </td>
                    <td className="px-5 py-4 font-mono text-white/60">
                      {b.startDate ? new Date(b.startDate).toLocaleDateString() : 'Immediate'}
                    </td>
                    <td className="px-5 py-4 font-mono font-semibold text-white">
                      UGX {b.totalPriceUgx?.toLocaleString() || '1,200,000'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        b.status === 'confirmed' ? 'bg-white text-black' :
                        b.status === 'pending' ? 'border border-white/40 text-white' :
                        'bg-white/10 text-white/40'
                      }`}>
                        {b.status || 'pending'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <select
                        value={b.status || 'pending'}
                        onChange={(e) => handleUpdateBookingStatus(b.id, e.target.value)}
                        className="bg-black border border-white/20 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-white"
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirm</option>
                        <option value="completed">Complete</option>
                        <option value="cancelled">Cancel</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {bookings.length === 0 && !loading && (
            <div className="text-center py-16">
              <CalendarCheck className="w-10 h-10 text-white/30 mx-auto mb-3" />
              <p className="text-sm text-white/60">No tourism bookings logged yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal for Create / Edit */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-black border border-white/20 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'create' ? 'Add New' : 'Edit'} {activeTab === 'destinations' ? 'Destination' : activeTab === 'packages' ? 'Package' : 'Guide'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Destination Form */}
            {activeTab === 'destinations' && (
              <form onSubmit={handleSaveDestination} className="space-y-4">
                <ImagePlaceholder
                  label="Destination Banner (User will supply image)"
                  aspectRatio="16:9"
                  value={destForm.imageUrl}
                  onChange={(val) => setDestForm(prev => ({ ...prev, imageUrl: val }))}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Destination Name</label>
                    <input
                      type="text"
                      required
                      value={destForm.name}
                      onChange={e => setDestForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Bwindi Impenetrable Forest"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Category</label>
                    <select
                      value={destForm.category}
                      onChange={e => setDestForm(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    >
                      <option value="national_park">National Park</option>
                      <option value="wildlife_reserve">Wildlife Reserve</option>
                      <option value="mountain">Mountain / Hiking</option>
                      <option value="waterfall">Waterfall / Lake</option>
                      <option value="cultural">Cultural / Heritage</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/60 uppercase font-mono">Description</label>
                  <textarea
                    rows={3}
                    value={destForm.description}
                    onChange={e => setDestForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Full destination summary for mobile app users..."
                    className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Distance</label>
                    <input
                      type="text"
                      value={destForm.distanceFromKampala}
                      onChange={e => setDestForm(prev => ({ ...prev, distanceFromKampala: e.target.value }))}
                      placeholder="e.g. 460 km"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Travel Duration</label>
                    <input
                      type="text"
                      value={destForm.travelDuration}
                      onChange={e => setDestForm(prev => ({ ...prev, travelDuration: e.target.value }))}
                      placeholder="e.g. 8-9 hours"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Rating (1-5)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      value={destForm.rating}
                      onChange={e => setDestForm(prev => ({ ...prev, rating: parseFloat(e.target.value) }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="isPopular"
                    checked={destForm.isPopular}
                    onChange={e => setDestForm(prev => ({ ...prev, isPopular: e.target.checked }))}
                    className="rounded border-white/20 bg-black text-white focus:ring-0"
                  />
                  <label htmlFor="isPopular" className="text-xs text-white/80 font-medium cursor-pointer">
                    Highlight as Popular Destination on mobile home
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
                    Save Destination
                  </button>
                </div>
              </form>
            )}

            {/* Package Form */}
            {activeTab === 'packages' && (
              <form onSubmit={handleSavePackage} className="space-y-4">
                <ImagePlaceholder
                  label="Package Image (User will supply image)"
                  aspectRatio="16:9"
                  value={pkgForm.imageUrl}
                  onChange={(val) => setPkgForm(prev => ({ ...prev, imageUrl: val }))}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Target Destination</label>
                    <select
                      value={pkgForm.destinationId}
                      onChange={e => setPkgForm(prev => ({ ...prev, destinationId: e.target.value }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    >
                      {destinations.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Package Title</label>
                    <input
                      type="text"
                      required
                      value={pkgForm.title}
                      onChange={e => setPkgForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. 3-Day Gorilla Trekking Safari"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/60 uppercase font-mono">Package Description</label>
                  <textarea
                    rows={3}
                    value={pkgForm.description}
                    onChange={e => setPkgForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Full package details, inclusions, safari activities..."
                    className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Duration (Days)</label>
                    <input
                      type="number"
                      min="1"
                      value={pkgForm.durationDays}
                      onChange={e => setPkgForm(prev => ({ ...prev, durationDays: parseInt(e.target.value) || 1 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Price (UGX)</label>
                    <input
                      type="number"
                      step="50000"
                      value={pkgForm.priceUgx}
                      onChange={e => setPkgForm(prev => ({ ...prev, priceUgx: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Price (USD)</label>
                    <input
                      type="number"
                      step="10"
                      value={pkgForm.priceUsd}
                      onChange={e => setPkgForm(prev => ({ ...prev, priceUsd: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="isFeatured"
                    checked={pkgForm.isFeatured}
                    onChange={e => setPkgForm(prev => ({ ...prev, isFeatured: e.target.checked }))}
                    className="rounded border-white/20 bg-black text-white focus:ring-0"
                  />
                  <label htmlFor="isFeatured" className="text-xs text-white/80 font-medium cursor-pointer">
                    Feature prominently in tourism explore screen
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
                    Save Package
                  </button>
                </div>
              </form>
            )}

            {/* Guide Form */}
            {activeTab === 'guides' && (
              <form onSubmit={handleSaveGuide} className="space-y-4">
                <ImagePlaceholder
                  label="Guide Profile Photo (User will supply image)"
                  aspectRatio="1:1"
                  value={guideForm.avatarUrl}
                  onChange={(val) => setGuideForm(prev => ({ ...prev, avatarUrl: val }))}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Guide Full Name</label>
                    <input
                      type="text"
                      required
                      value={guideForm.name}
                      onChange={e => setGuideForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Kenneth Byaruhanga"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Phone Number</label>
                    <input
                      type="text"
                      required
                      value={guideForm.phone}
                      onChange={e => setGuideForm(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="+256 700 000000"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/60 uppercase font-mono">Bio & Qualifications</label>
                  <textarea
                    rows={2}
                    value={guideForm.bio}
                    onChange={e => setGuideForm(prev => ({ ...prev, bio: e.target.value }))}
                    placeholder="UWA certified safari guide with 8 years experience across Queen Elizabeth and Murchison Falls..."
                    className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Languages (comma-separated)</label>
                    <input
                      type="text"
                      value={guideForm.languages}
                      onChange={e => setGuideForm(prev => ({ ...prev, languages: e.target.value }))}
                      placeholder="English, Swahili, German"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Specialties (comma-separated)</label>
                    <input
                      type="text"
                      value={guideForm.specialties}
                      onChange={e => setGuideForm(prev => ({ ...prev, specialties: e.target.value }))}
                      placeholder="Gorillas, Birding, Hiking"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Experience (Years)</label>
                    <input
                      type="number"
                      min="1"
                      value={guideForm.yearsOfExperience}
                      onChange={e => setGuideForm(prev => ({ ...prev, yearsOfExperience: parseInt(e.target.value) || 1 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Fee / Day (UGX)</label>
                    <input
                      type="number"
                      step="10000"
                      value={guideForm.pricePerDayUgx}
                      onChange={e => setGuideForm(prev => ({ ...prev, pricePerDayUgx: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Fee / Day (USD)</label>
                    <input
                      type="number"
                      step="5"
                      value={guideForm.pricePerDayUsd}
                      onChange={e => setGuideForm(prev => ({ ...prev, pricePerDayUsd: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={guideForm.isCertified}
                      onChange={e => setGuideForm(prev => ({ ...prev, isCertified: e.target.checked }))}
                      className="rounded border-white/20 bg-black text-white focus:ring-0"
                    />
                    <span className="text-xs text-white/80">Certified Guide Badge</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={guideForm.isAvailable}
                      onChange={e => setGuideForm(prev => ({ ...prev, isAvailable: e.target.checked }))}
                      className="rounded border-white/20 bg-black text-white focus:ring-0"
                    />
                    <span className="text-xs text-white/80">Available for Dispatch</span>
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
                    Save Guide
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
