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
  CheckCircle2,
  X,
  Copy,
  Car,
  Users,
  Layers,
  DollarSign,
} from 'lucide-react';
import { api } from '@/lib/api';
import { ImagePlaceholder } from '@/components/ImagePlaceholder';
import { ImageUploader } from '@/components/ImageUploader';
import { RichContentEditor, ContentBlockItem as RichContentBlock } from '@/components/RichContentEditor';

type Tab = 'destinations' | 'packages' | 'guides' | 'bookings';

interface TouristPricingTier {
  minTourists: number;
  maxTourists: number;
  priceUgx: number;
  pricingMode: 'PER_PERSON' | 'GROUP_TOTAL';
  extraPersonChargeUgx?: number;
  notes?: string;
}

interface AdditionalCharge {
  label: string;
  amountUgx: number;
  perPerson: boolean;
}

interface ItineraryStep {
  day: number;
  title: string;
  description: string;
}

export default function TourismPage() {
  const [activeTab, setActiveTab] = useState<Tab>('destinations');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [destinations, setDestinations] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [guides, setGuides] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [tourVehicles, setTourVehicles] = useState<any[]>([]);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Form states — all 23 fields for Destination
  const [destForm, setDestForm] = useState({
    name: '',
    category: 'national_park',
    country: 'Uganda',
    region: 'Western Uganda',
    district: '',
    locationAddress: '',
    shortDescription: '',
    description: '',
    contentBlocks: [] as RichContentBlock[],
    imageUrl: '',
    galleryImages: [] as string[],
    latitude: 0.3476,
    longitude: 32.5825,
    distanceFromKampala: '300 km',
    travelDuration: '5 hours',
    recommendedDuration: '3 Days / 2 Nights',
    rating: 4.8,
    isPopular: true,
    highlights: '',
    activities: '',
    inclusions: '',
    exclusions: '',
    bestTimeToVisit: 'Year-round',
    basePriceUgx: 850000,
    touristPricingTiers: [] as TouristPricingTier[],
    assignedVehicleIds: [] as string[],
    assignedGuideIds: [] as string[],
    itinerary: [] as ItineraryStep[],
    additionalCharges: [] as AdditionalCharge[],
    bookingAvailable: true,
    publicationStatus: 'PUBLISHED' as 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED',
    displayOrder: 0,
  });

  // Form states — Package
  const [pkgForm, setPkgForm] = useState({
    destinationId: '',
    title: '',
    durationDays: 3,
    priceUgx: 1200000,
    priceUsd: 350,
    shortDescription: '',
    description: '',
    contentBlocks: [] as RichContentBlock[],
    imageUrl: '',
    galleryImages: [] as string[],
    isFeatured: true,
    inclusions: '',
    exclusions: '',
    itinerarySummary: '',
    itinerary: [] as ItineraryStep[],
    touristPricingTiers: [] as TouristPricingTier[],
    assignedVehicleIds: [] as string[],
    assignedGuideIds: [] as string[],
    additionalCharges: [] as AdditionalCharge[],
    bookingAvailable: true,
    publicationStatus: 'PUBLISHED' as 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED',
    displayOrder: 0,
  });

  // Form states — Guide
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
    multiDayRateUgx: 135000,
    fixedTourFeeUgx: 0,
    groupSizeSurchargeUgx: 20000,
    isCertified: true,
    isAvailable: true,
    avatarUrl: '',
    bio: '',
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, p, g, b, v] = await Promise.all([
        api.getDestinations(true).catch(() => []),
        api.getPackages(undefined, true).catch(() => []),
        api.getGuides().catch(() => []),
        api.getBookings().catch(() => []),
        api.getCatalogueVehicles({ service: 'tours' }).catch(() => []),
      ]);
      setDestinations(d);
      setPackages(p);
      setGuides(g);
      setBookings(b);
      setTourVehicles(v);
    } catch (err: any) {
      setError(err.message || 'Failed to load tourism data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetDestForm = () => {
    setDestForm({
      name: '',
      category: 'national_park',
      country: 'Uganda',
      region: 'Western Uganda',
      district: '',
      locationAddress: '',
      shortDescription: '',
      description: '',
      contentBlocks: [],
      imageUrl: '',
      galleryImages: [],
      latitude: 0.3476,
      longitude: 32.5825,
      distanceFromKampala: '300 km',
      travelDuration: '5 hours',
      recommendedDuration: '3 Days / 2 Nights',
      rating: 4.8,
      isPopular: true,
      highlights: '',
      activities: '',
      inclusions: '',
      exclusions: '',
      bestTimeToVisit: 'Year-round',
      basePriceUgx: 850000,
      touristPricingTiers: [
        { minTourists: 1, maxTourists: 1, priceUgx: 950000, pricingMode: 'PER_PERSON', notes: 'Solo traveler rate' },
        { minTourists: 2, maxTourists: 4, priceUgx: 800000, pricingMode: 'PER_PERSON', notes: 'Small group rate' },
        { minTourists: 5, maxTourists: 10, priceUgx: 700000, pricingMode: 'PER_PERSON', notes: 'Group expedition rate' },
      ],
      assignedVehicleIds: [],
      assignedGuideIds: [],
      itinerary: [],
      additionalCharges: [],
      bookingAvailable: true,
      publicationStatus: 'PUBLISHED',
      displayOrder: destinations.length + 1,
    });
  };

  const resetPkgForm = () => {
    setPkgForm({
      destinationId: destinations[0]?.id || '',
      title: '',
      durationDays: 3,
      priceUgx: 1200000,
      priceUsd: 350,
      shortDescription: '',
      description: '',
      contentBlocks: [],
      imageUrl: '',
      galleryImages: [],
      isFeatured: true,
      inclusions: '',
      exclusions: '',
      itinerarySummary: '',
      itinerary: [],
      touristPricingTiers: [
        { minTourists: 1, maxTourists: 1, priceUgx: 1350000, pricingMode: 'PER_PERSON', notes: 'Solo traveler' },
        { minTourists: 2, maxTourists: 4, priceUgx: 1200000, pricingMode: 'PER_PERSON', notes: '2-4 travelers' },
        { minTourists: 5, maxTourists: 10, priceUgx: 1050000, pricingMode: 'PER_PERSON', notes: '5-10 travelers' },
      ],
      assignedVehicleIds: [],
      assignedGuideIds: [],
      additionalCharges: [],
      bookingAvailable: true,
      publicationStatus: 'PUBLISHED',
      displayOrder: packages.length + 1,
    });
  };

  const handleSaveDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...destForm,
        highlights: typeof destForm.highlights === 'string'
          ? destForm.highlights.split('\n').map(s => s.trim()).filter(Boolean)
          : destForm.highlights,
        activities: typeof destForm.activities === 'string'
          ? destForm.activities.split('\n').map(s => s.trim()).filter(Boolean)
          : destForm.activities,
        inclusions: typeof destForm.inclusions === 'string'
          ? destForm.inclusions.split('\n').map(s => s.trim()).filter(Boolean)
          : destForm.inclusions,
        exclusions: typeof destForm.exclusions === 'string'
          ? destForm.exclusions.split('\n').map(s => s.trim()).filter(Boolean)
          : destForm.exclusions,
      };
      if (modalMode === 'create') {
        await api.createDestination(payload);
      } else {
        await api.updateDestination(selectedItem.id, payload);
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
      const payload = {
        ...pkgForm,
        inclusions: typeof pkgForm.inclusions === 'string'
          ? pkgForm.inclusions.split('\n').map(s => s.trim()).filter(Boolean)
          : pkgForm.inclusions,
        exclusions: typeof pkgForm.exclusions === 'string'
          ? pkgForm.exclusions.split('\n').map(s => s.trim()).filter(Boolean)
          : pkgForm.exclusions,
        itinerarySummary: typeof pkgForm.itinerarySummary === 'string'
          ? pkgForm.itinerarySummary.split('\n').map(s => s.trim()).filter(Boolean)
          : pkgForm.itinerarySummary,
      };
      if (modalMode === 'create') {
        await api.createPackage(payload);
      } else {
        await api.updatePackage(selectedItem.id, payload);
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
        languages: typeof guideForm.languages === 'string' ? guideForm.languages.split(',').map(s => s.trim()).filter(Boolean) : guideForm.languages,
        specialties: typeof guideForm.specialties === 'string' ? guideForm.specialties.split(',').map(s => s.trim()).filter(Boolean) : guideForm.specialties,
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

  const handleDuplicate = async (type: 'destinations' | 'packages', id: string) => {
    try {
      if (type === 'destinations') await api.duplicateDestination(id);
      if (type === 'packages') await api.duplicatePackage(id);
      loadData();
    } catch (err: any) {
      alert(`Error duplicating: ${err.message}`);
    }
  };

  const handleUpdateBookingStatus = async (id: string, status: string) => {
    try {
      await api.updateBookingStatus(id, status.toUpperCase());
      loadData();
    } catch (err: any) {
      alert(`Failed to update booking status: ${err.message}`);
    }
  };

  const handleAssignGuide = async (bookingId: string, guideId: string) => {
    if (!guideId) return;
    try {
      await api.assignGuideToBooking(bookingId, guideId);
      loadData();
    } catch (err: any) {
      alert(`Failed to assign tour guide: ${err.message}`);
    }
  };

  const toggleIdInList = (list: string[], id: string): string[] => {
    return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 min-w-0 max-w-7xl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Compass className="w-7 h-7 text-white" />
            Tourism, Safari CMS &amp; Dynamic Pricing
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Full server-driven CMS for destinations, rich multimedia blocks (Cloudflare R2), tourist-count pricing tiers, vehicle assignments, and certified guides.
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
                if (activeTab === 'destinations') resetDestForm();
                if (activeTab === 'packages') resetPkgForm();
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

      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-mono">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 overflow-x-auto">
        {[
          { id: 'destinations', label: 'Destinations CMS', icon: MapPin, count: destinations.length },
          { id: 'packages', label: 'Tour Packages', icon: PackageIcon, count: packages.length },
          { id: 'guides', label: 'Certified Guides', icon: UserCheck, count: guides.length },
          { id: 'bookings', label: 'Bookings & Quotations', icon: CalendarCheck, count: bookings.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors relative whitespace-nowrap ${
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

      {/* ─── Tab: Destinations ─── */}
      {activeTab === 'destinations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {destinations.map((dest) => {
              const pubStatus = dest.publicationStatus || dest.publication_status || 'PUBLISHED';
              const basePrice = dest.basePriceUgx || dest.base_price_ugx || 850000;
              const tiersCount = Array.isArray(dest.touristPricingTiers) ? dest.touristPricingTiers.length : 0;
              const blocksCount = Array.isArray(dest.contentBlocks) ? dest.contentBlocks.length : 0;
              return (
                <div
                  key={dest.id}
                  className="rounded-2xl border border-white/15 overflow-hidden hover:border-white/35 transition-all bg-white/[0.02] flex flex-col justify-between shadow-xl group"
                >
                  <div className="relative w-full aspect-[16/10] bg-white/[0.03] overflow-hidden">
                    <ImagePlaceholder
                      aspectRatio="16:9"
                      value={dest.imageUrl}
                      folder="tourism"
                      hint="Click to upload destination photo (Cloudflare R2)"
                      onChange={async (val) => {
                        setDestinations(prev => prev.map(d => d.id === dest.id ? { ...d, imageUrl: val } : d));
                        try { await api.updateDestination(dest.id, { imageUrl: val }); } catch {}
                      }}
                    />
                    <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-mono font-semibold tracking-wider px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/15 text-white">
                        {dest.category?.replace(/_/g, ' ') || 'National Park'}
                      </span>
                      <span className={`text-[10px] uppercase font-mono font-bold px-2 py-1 rounded-md ${
                        pubStatus === 'PUBLISHED' ? 'bg-emerald-500/90 text-black' :
                        pubStatus === 'DRAFT' ? 'bg-amber-500/90 text-black' :
                        'bg-red-500/80 text-white'
                      }`}>
                        {pubStatus}
                      </span>
                    </div>
                    {dest.isPopular && (
                      <div className="absolute top-3 right-3 z-10">
                        <span className="text-[10px] bg-white text-black font-bold px-2.5 py-1 rounded-md shadow-md">
                          Popular
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-white/40 uppercase">
                          {dest.region || 'Uganda'} {dest.district ? `• ${dest.district}` : ''}
                        </span>
                        <span className="text-[10px] font-mono text-white/40">v{dest.contentVersion || 1}</span>
                      </div>
                      <h3 className="text-lg font-bold text-white tracking-tight leading-snug mt-0.5">{dest.name}</h3>
                      <p className="text-xs text-white/60 line-clamp-2 mt-1.5 leading-relaxed">
                        {dest.shortDescription || dest.description || 'Iconic Ugandan safari destination with extraordinary wildlife.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-2 border-t border-white/10">
                      <div className="bg-white/[0.03] p-2 rounded border border-white/10">
                        <span className="text-white/40 block text-[9px] uppercase">Base Rate</span>
                        <span className="text-white font-bold">UGX {Number(basePrice).toLocaleString()}</span>
                      </div>
                      <div className="bg-white/[0.03] p-2 rounded border border-white/10">
                        <span className="text-white/40 block text-[9px] uppercase">Rich CMS / Tiers</span>
                        <span className="text-white font-bold">{blocksCount} blocks • {tiersCount} tiers</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-white/60 font-mono pt-2 border-t border-white/10">
                      <span>📍 {dest.distanceFromKampala || '300 km'}</span>
                      <span>⏱️ {dest.travelDuration || '5 hours'}</span>
                      <span className="text-amber-300 font-bold">★ {dest.rating || 4.8}</span>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleDuplicate('destinations', dest.id)}
                        title="Duplicate destination as draft"
                        className="px-2.5 py-2 border border-white/15 rounded-lg hover:bg-white/10 text-xs font-mono text-white/70 hover:text-white flex items-center gap-1 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" /> Clone
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedItem(dest);
                            setDestForm({
                              name: dest.name || '',
                              category: dest.category || 'national_park',
                              country: dest.country || 'Uganda',
                              region: dest.region || 'Western Uganda',
                              district: dest.district || '',
                              locationAddress: dest.locationAddress || dest.location_address || '',
                              shortDescription: dest.shortDescription || dest.short_description || '',
                              description: dest.description || '',
                              contentBlocks: Array.isArray(dest.contentBlocks || dest.content_blocks) ? (dest.contentBlocks || dest.content_blocks) : [],
                              imageUrl: dest.imageUrl || '',
                              galleryImages: Array.isArray(dest.galleryImages) ? dest.galleryImages : [],
                              latitude: dest.latitude || 0.3476,
                              longitude: dest.longitude || 32.5825,
                              distanceFromKampala: dest.distanceFromKampala || '300 km',
                              travelDuration: dest.travelDuration || '5 hours',
                              recommendedDuration: dest.recommendedDuration || dest.recommended_duration || '3 Days / 2 Nights',
                              rating: dest.rating || 4.8,
                              isPopular: dest.isPopular ?? true,
                              highlights: Array.isArray(dest.highlights) ? dest.highlights.join('\n') : (dest.highlights || ''),
                              activities: Array.isArray(dest.activities) ? dest.activities.join('\n') : (dest.activities || ''),
                              inclusions: Array.isArray(dest.inclusions) ? dest.inclusions.join('\n') : (dest.inclusions || ''),
                              exclusions: Array.isArray(dest.exclusions) ? dest.exclusions.join('\n') : (dest.exclusions || ''),
                              bestTimeToVisit: dest.best_time_to_visit || dest.bestTimeToVisit || 'Year-round',
                              basePriceUgx: Number(dest.basePriceUgx || dest.base_price_ugx || 850000),
                              touristPricingTiers: Array.isArray(dest.touristPricingTiers || dest.tourist_pricing_tiers) ? (dest.touristPricingTiers || dest.tourist_pricing_tiers) : [],
                              assignedVehicleIds: Array.isArray(dest.assignedVehicleIds || dest.assigned_vehicle_ids) ? (dest.assignedVehicleIds || dest.assigned_vehicle_ids) : [],
                              assignedGuideIds: Array.isArray(dest.assignedGuideIds || dest.assigned_guide_ids) ? (dest.assignedGuideIds || dest.assigned_guide_ids) : [],
                              itinerary: Array.isArray(dest.itinerary) ? dest.itinerary : [],
                              additionalCharges: Array.isArray(dest.additionalCharges || dest.additional_charges) ? (dest.additionalCharges || dest.additional_charges) : [],
                              bookingAvailable: dest.bookingAvailable ?? dest.booking_available ?? true,
                              publicationStatus: (dest.publicationStatus || dest.publication_status || 'PUBLISHED') as any,
                              displayOrder: Number(dest.displayOrder || dest.display_order || 0),
                            });
                            setModalMode('edit');
                            setShowModal(true);
                          }}
                          className="px-3.5 py-2 border border-white/15 rounded-lg hover:bg-white/10 text-xs font-semibold text-white/90 hover:text-white flex items-center gap-1.5 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit CMS
                        </button>
                        <button
                          onClick={() => handleDelete('destinations', dest.id)}
                          className="px-3 py-2 border border-red-500/20 rounded-lg hover:bg-red-500/10 text-xs font-semibold text-red-400 flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {destinations.length === 0 && !loading && (
            <div className="text-center py-20 border border-dashed border-white/15 rounded-2xl bg-white/[0.01]">
              <MapPin className="w-12 h-12 text-white/30 mx-auto mb-3" />
              <p className="text-sm text-white/60">No destinations configured yet.</p>
              <button
                onClick={() => { setModalMode('create'); resetDestForm(); setShowModal(true); }}
                className="mt-4 px-5 py-2.5 bg-white text-black text-xs font-semibold rounded-lg hover:bg-white/90 shadow-md"
              >
                Add First Destination
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Tour Packages ─── */}
      {activeTab === 'packages' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {packages.map((pkg) => {
              const destName = destinations.find(d => d.id === pkg.destinationId)?.name || pkg.destination?.name || 'Uganda Safari';
              const pubStatus = pkg.publicationStatus || pkg.publication_status || 'PUBLISHED';
              const tiersCount = Array.isArray(pkg.touristPricingTiers) ? pkg.touristPricingTiers.length : 0;
              return (
                <div
                  key={pkg.id}
                  className="rounded-2xl border border-white/15 overflow-hidden hover:border-white/35 transition-all bg-white/[0.02] flex flex-col md:flex-row shadow-xl group"
                >
                  <div className="md:w-1/2 relative bg-white/[0.03] overflow-hidden flex flex-col justify-center min-h-[240px]">
                    <ImagePlaceholder
                      aspectRatio="1:1"
                      value={pkg.imageUrl}
                      folder="tourism"
                      hint="Click to upload tour package photo (Cloudflare R2)"
                      onChange={async (val) => {
                        setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, imageUrl: val } : p));
                        try { await api.updatePackage(pkg.id, { imageUrl: val }); } catch {}
                      }}
                    />
                    <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/15 text-white">
                        {pkg.durationDays} DAYS SAFARI
                      </span>
                      <span className={`text-[10px] uppercase font-mono font-bold px-2 py-1 rounded-md ${
                        pubStatus === 'PUBLISHED' ? 'bg-emerald-500/90 text-black' :
                        pubStatus === 'DRAFT' ? 'bg-amber-500/90 text-black' :
                        'bg-red-500/80 text-white'
                      }`}>
                        {pubStatus}
                      </span>
                    </div>
                  </div>

                  <div className="md:w-1/2 p-6 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-white/50">
                          {destName}
                        </span>
                        {pkg.isFeatured && (
                          <span className="text-[9px] bg-white text-black font-bold px-2 py-0.5 rounded shadow-sm">
                            Featured
                          </span>
                        )}
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-white leading-snug line-clamp-2">
                        {pkg.title}
                      </h3>
                      <p className="text-xs text-white/60 line-clamp-2 mt-2 leading-relaxed">
                        {pkg.shortDescription || pkg.description || 'Complete guided wildlife expedition with transport, permits and lodging.'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-mono text-white/60">
                        <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/10">
                          {tiersCount} Pricing Tiers
                        </span>
                        <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/10">
                          {(pkg.contentBlocks || []).length} Rich Blocks
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-end justify-between">
                      <div>
                        <p className="text-[10px] uppercase font-mono tracking-wider text-white/40">Base Rate</p>
                        <p className="text-base font-mono font-bold text-white mt-0.5">
                          UGX {Number(pkg.priceUgx || 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-white/50 font-mono">${pkg.priceUsd} USD</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDuplicate('packages', pkg.id)}
                          title="Duplicate package as draft"
                          className="px-2.5 py-1.5 border border-white/15 rounded-lg hover:bg-white/10 text-xs font-mono text-white/70 hover:text-white flex items-center gap-1 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(pkg);
                            setPkgForm({
                              destinationId: pkg.destinationId || pkg.destination_id || '',
                              title: pkg.title || '',
                              durationDays: pkg.durationDays || pkg.duration_days || 3,
                              priceUgx: pkg.priceUgx || pkg.price_per_person_ugx || 1200000,
                              priceUsd: pkg.priceUsd || Math.round((pkg.price_per_person_ugx || 1200000) / 3700),
                              shortDescription: pkg.shortDescription || pkg.short_description || '',
                              description: pkg.description || '',
                              contentBlocks: Array.isArray(pkg.contentBlocks || pkg.content_blocks) ? (pkg.contentBlocks || pkg.content_blocks) : [],
                              imageUrl: pkg.imageUrl || '',
                              galleryImages: Array.isArray(pkg.galleryImages) ? pkg.galleryImages : [],
                              isFeatured: pkg.isFeatured ?? true,
                              inclusions: Array.isArray(pkg.inclusions) ? pkg.inclusions.join('\n') : (pkg.inclusions || ''),
                              exclusions: Array.isArray(pkg.exclusions) ? pkg.exclusions.join('\n') : (pkg.exclusions || ''),
                              itinerarySummary: Array.isArray(pkg.itinerarySummary || pkg.itinerary_summary)
                                ? (pkg.itinerarySummary || pkg.itinerary_summary).join('\n')
                                : (pkg.itinerarySummary || pkg.itinerary_summary || ''),
                              itinerary: Array.isArray(pkg.itinerary) ? pkg.itinerary : [],
                              touristPricingTiers: Array.isArray(pkg.touristPricingTiers || pkg.tourist_pricing_tiers) ? (pkg.touristPricingTiers || pkg.tourist_pricing_tiers) : [],
                              assignedVehicleIds: Array.isArray(pkg.assignedVehicleIds || pkg.assigned_vehicle_ids) ? (pkg.assignedVehicleIds || pkg.assigned_vehicle_ids) : [],
                              assignedGuideIds: Array.isArray(pkg.assignedGuideIds || pkg.assigned_guide_ids) ? (pkg.assignedGuideIds || pkg.assigned_guide_ids) : [],
                              additionalCharges: Array.isArray(pkg.additionalCharges || pkg.additional_charges) ? (pkg.additionalCharges || pkg.additional_charges) : [],
                              bookingAvailable: pkg.bookingAvailable ?? pkg.booking_available ?? true,
                              publicationStatus: (pkg.publicationStatus || pkg.publication_status || 'PUBLISHED') as any,
                              displayOrder: Number(pkg.displayOrder || pkg.display_order || 0),
                            });
                            setModalMode('edit');
                            setShowModal(true);
                          }}
                          className="px-3 py-1.5 border border-white/15 rounded-lg hover:bg-white/10 text-xs font-semibold text-white/90 hover:text-white flex items-center gap-1 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete('packages', pkg.id)}
                          className="px-2.5 py-1.5 border border-red-500/20 rounded-lg hover:bg-red-500/10 text-xs font-semibold text-red-400 flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {packages.length === 0 && !loading && (
            <div className="text-center py-20 border border-dashed border-white/15 rounded-2xl bg-white/[0.01]">
              <PackageIcon className="w-12 h-12 text-white/30 mx-auto mb-3" />
              <p className="text-sm text-white/60">No tour packages created yet.</p>
              <button
                onClick={() => { setModalMode('create'); resetPkgForm(); setShowModal(true); }}
                className="mt-4 px-5 py-2.5 bg-white text-black text-xs font-semibold rounded-lg hover:bg-white/90 shadow-md"
              >
                Create First Package
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Certified Guides ─── */}
      {activeTab === 'guides' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {guides.map((g) => (
              <div
                key={g.id}
                className="rounded-2xl border border-white/15 overflow-hidden hover:border-white/35 transition-all bg-white/[0.02] flex flex-col justify-between shadow-xl group"
              >
                <div className="relative w-full aspect-[4/3] bg-white/[0.03] overflow-hidden">
                  <ImagePlaceholder
                    aspectRatio="4:3"
                    value={g.avatarUrl}
                    folder="tourism"
                    hint="Click to upload guide photo (Cloudflare R2)"
                    onChange={async (val) => {
                      setGuides(prev => prev.map(guide => guide.id === g.id ? { ...guide, avatarUrl: val } : guide));
                      try { await api.updateGuide(g.id, { avatarUrl: val }); } catch {}
                    }}
                  />
                  <div className="absolute top-3 left-3 z-10">
                    <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-md ${
                      g.isAvailable !== false ? 'bg-emerald-500/90 text-black' : 'bg-amber-500/90 text-black'
                    }`}>
                      {g.isAvailable !== false ? 'AVAILABLE' : 'UNAVAILABLE'}
                    </span>
                  </div>
                  {g.isCertified && (
                    <div className="absolute top-3 right-3 z-10">
                      <span className="text-[10px] bg-white text-black font-bold px-2.5 py-1 rounded-md shadow-md flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-black" /> Certified
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">{g.name || g.fullName}</h3>
                    <p className="text-xs text-white/40 font-mono mt-0.5">{g.phone || 'No direct phone'}</p>
                    <p className="text-xs text-white/60 line-clamp-2 mt-2 leading-relaxed">
                      {g.bio || 'Licensed Uganda Wildlife Authority (UWA) safari and wilderness guide.'}
                    </p>
                  </div>

                  <div className="space-y-1.5 text-xs pt-3 border-t border-white/10">
                    <div className="flex items-center justify-between text-white/50">
                      <span>Languages:</span>
                      <span className="text-white font-mono text-right truncate max-w-[65%]">
                        {Array.isArray(g.languages) ? g.languages.join(', ') : g.languages || 'English'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-white/50">
                      <span>Daily Fee:</span>
                      <span className="text-white font-mono font-bold text-sm">
                        UGX {Number(g.pricePerDayUgx || g.daily_rate_ugx || 150000).toLocaleString()} / day
                      </span>
                    </div>
                    {(g.multiDayRateUgx > 0 || g.multi_day_rate_ugx > 0) && (
                      <div className="flex items-center justify-between text-white/50">
                        <span>Multi-Day Rate:</span>
                        <span className="text-emerald-400 font-mono text-xs">
                          UGX {Number(g.multiDayRateUgx || g.multi_day_rate_ugx).toLocaleString()} / day
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2.5">
                    <button
                      onClick={() => {
                        setSelectedItem(g);
                        setGuideForm({
                          name: g.name || g.fullName || '',
                          phone: g.phone || '',
                          email: g.email || '',
                          languages: Array.isArray(g.languages) ? g.languages.join(', ') : (g.languages || ''),
                          specialties: Array.isArray(g.specialties) ? g.specialties.join(', ') : (g.specialties || ''),
                          yearsOfExperience: g.yearsOfExperience || 5,
                          rating: g.rating || 4.9,
                          pricePerDayUgx: g.pricePerDayUgx || g.daily_rate_ugx || 150000,
                          pricePerDayUsd: g.pricePerDayUsd || 45,
                          multiDayRateUgx: g.multiDayRateUgx || g.multi_day_rate_ugx || 135000,
                          fixedTourFeeUgx: g.fixedTourFeeUgx || g.fixed_tour_fee_ugx || 0,
                          groupSizeSurchargeUgx: g.groupSizeSurchargeUgx || g.group_size_surcharge_ugx || 20000,
                          isCertified: g.isCertified ?? true,
                          isAvailable: g.isAvailable ?? true,
                          avatarUrl: g.avatarUrl || '',
                          bio: g.bio || '',
                        });
                        setModalMode('edit');
                        setShowModal(true);
                      }}
                      className="px-3.5 py-2 border border-white/15 rounded-lg hover:bg-white/10 text-xs font-semibold text-white/90 hover:text-white flex items-center gap-1.5 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete('guides', g.id)}
                      className="px-3.5 py-2 border border-red-500/20 rounded-lg hover:bg-red-500/10 text-xs font-semibold text-red-400 flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {guides.length === 0 && !loading && (
            <div className="text-center py-20 border border-dashed border-white/15 rounded-2xl bg-white/[0.01]">
              <UserCheck className="w-12 h-12 text-white/30 mx-auto mb-3" />
              <p className="text-sm text-white/60">No certified guides registered yet.</p>
              <button
                onClick={() => { setModalMode('create'); setShowModal(true); }}
                className="mt-4 px-5 py-2.5 bg-white text-black text-xs font-semibold rounded-lg hover:bg-white/90 shadow-md"
              >
                Register First Guide
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Bookings ─── */}
      {activeTab === 'bookings' && (
        <div className="border border-white/15 rounded-xl overflow-hidden bg-black">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/[0.02] text-white/40 uppercase font-mono tracking-wider">
                <tr>
                  <th className="px-5 py-3">Booking / Quote</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Destination / Package</th>
                  <th className="px-5 py-3">Assigned Tour Guide</th>
                  <th className="px-5 py-3">Travel Date</th>
                  <th className="px-5 py-3">Authoritative Total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/80">
                {bookings.map((b) => {
                  const statusVal = String(b.bookingStatus || b.booking_status || b.status || 'PENDING_PAYMENT').toUpperCase();
                  const assignedGuideId = b.tourGuideId || b.tour_guide_id || '';
                  const assignedGuide = guides.find((g) => g.id === assignedGuideId);
                  const amount = b.totalAmountUGX || b.total_amount_ugx || b.totalPriceUgx || b.total_ugx || 0;
                  const guests = b.guestsCount || b.guests_count || b.peopleCount || b.guests || 1;
                  const travelDate = b.travelDate || b.travel_date || b.startDate;
                  return (
                    <tr key={b.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 font-mono text-[11px] text-white/50">
                        <div>{b.id?.slice(0, 12)}...</div>
                        {b.quotationId && (
                          <div className="text-[9px] text-emerald-400">Quote: {b.quotationId.slice(0, 10)} (v{b.pricingVersion || 1})</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-white">{b.customer?.fullName || b.user?.name || b.contactName || 'Safari Guest'}</p>
                        <p className="text-[11px] text-white/40 font-mono">{b.customer?.phone || b.contactPhone || b.user?.phoneNumber || '-'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-white">{b.package?.title || b.destination?.name || 'Custom Safari'}</p>
                        <p className="text-[11px] text-white/40">{guests} Guest{guests > 1 ? 's' : ''}</p>
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={assignedGuideId}
                          onChange={(e) => handleAssignGuide(b.id, e.target.value)}
                          className="bg-black border border-white/20 rounded px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-white min-w-[160px]"
                        >
                          <option value="">-- Assign Approved Guide --</option>
                          {guides.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.fullName || g.name} {g.isAvailable === false ? '(Busy)' : '(Available)'}
                            </option>
                          ))}
                        </select>
                        {assignedGuide && (
                          <p className="text-[10px] text-emerald-400 font-mono mt-1">
                            Assigned: {assignedGuide.fullName || assignedGuide.name}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 font-mono text-white/60">
                        {travelDate ? new Date(travelDate).toLocaleDateString() : 'Scheduled'}
                      </td>
                      <td className="px-5 py-4 font-mono font-semibold text-white">
                        UGX {Number(amount).toLocaleString()}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          statusVal === 'CONFIRMED' || statusVal === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                          statusVal === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                          statusVal === 'CANCELLED' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                          'border border-white/40 text-white'
                        }`}>
                          {statusVal}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <select
                          value={statusVal}
                          onChange={(e) => handleUpdateBookingStatus(b.id, e.target.value)}
                          className="bg-black border border-white/20 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-white"
                        >
                          <option value="PENDING_PAYMENT">Pending Payment</option>
                          <option value="CONFIRMED">Confirmed</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
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

      {/* ─── Modal for Create / Edit ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-black border border-white/20 rounded-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {modalMode === 'create' ? 'Create New' : 'Edit'} {activeTab === 'destinations' ? 'Destination CMS & Pricing' : activeTab === 'packages' ? 'Tour Package CMS & Pricing' : 'Certified Tour Guide'}
                </h3>
                <p className="text-xs text-white/50 mt-0.5">
                  All changes publish immediately to the SAFARIS mobile application without requiring a Play Store rebuild.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Destination Form ── */}
            {activeTab === 'destinations' && (
              <form onSubmit={handleSaveDestination} className="space-y-6">
                {/* Publication Status & Display Order */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl border border-white/15 bg-white/[0.02]">
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Publication Status</label>
                    <select
                      value={destForm.publicationStatus}
                      onChange={e => setDestForm(prev => ({ ...prev, publicationStatus: e.target.value as any }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    >
                      <option value="PUBLISHED">PUBLISHED (Live on App)</option>
                      <option value="DRAFT">DRAFT (Hidden from App)</option>
                      <option value="UNPUBLISHED">UNPUBLISHED</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Display Order</label>
                    <input
                      type="number"
                      value={destForm.displayOrder}
                      onChange={e => setDestForm(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-white"
                    />
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={destForm.bookingAvailable}
                        onChange={e => setDestForm(prev => ({ ...prev, bookingAvailable: e.target.checked }))}
                        className="rounded border-white/20 bg-black text-white"
                      />
                      <span className="text-xs text-white/80 font-medium">Booking Open</span>
                    </label>
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={destForm.isPopular}
                        onChange={e => setDestForm(prev => ({ ...prev, isPopular: e.target.checked }))}
                        className="rounded border-white/20 bg-black text-white"
                      />
                      <span className="text-xs text-white/80 font-medium">Featured / Popular</span>
                    </label>
                  </div>
                </div>

                <ImageUploader
                  label="Hero Cover Image (Cloudflare R2)"
                  value={destForm.imageUrl}
                  onChange={(val) => setDestForm(prev => ({ ...prev, imageUrl: val }))}
                  folder="tourism"
                  recommendedSize="1200 x 900 px (4:3)"
                />

                {/* Basic Identity & Geography */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Destination Name *</label>
                    <input
                      type="text"
                      required
                      value={destForm.name}
                      onChange={e => setDestForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Bwindi Impenetrable National Park"
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
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Recommended Duration</label>
                    <input
                      type="text"
                      value={destForm.recommendedDuration}
                      onChange={e => setDestForm(prev => ({ ...prev, recommendedDuration: e.target.value }))}
                      placeholder="e.g. 3 Days / 2 Nights"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Country</label>
                    <input
                      type="text"
                      value={destForm.country}
                      onChange={e => setDestForm(prev => ({ ...prev, country: e.target.value }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Region</label>
                    <input
                      type="text"
                      value={destForm.region}
                      onChange={e => setDestForm(prev => ({ ...prev, region: e.target.value }))}
                      placeholder="Western Uganda"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">District</label>
                    <input
                      type="text"
                      value={destForm.district}
                      onChange={e => setDestForm(prev => ({ ...prev, district: e.target.value }))}
                      placeholder="Kanungu"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Location / Address</label>
                    <input
                      type="text"
                      value={destForm.locationAddress}
                      onChange={e => setDestForm(prev => ({ ...prev, locationAddress: e.target.value }))}
                      placeholder="Buhoma Sector Gate"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Short Card Summary</label>
                    <input
                      type="text"
                      value={destForm.shortDescription}
                      onChange={e => setDestForm(prev => ({ ...prev, shortDescription: e.target.value }))}
                      placeholder="One-line summary shown on discovery cards..."
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Base Starting Price (UGX)</label>
                    <input
                      type="number"
                      step="50000"
                      value={destForm.basePriceUgx}
                      onChange={e => setDestForm(prev => ({ ...prev, basePriceUgx: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/60 uppercase font-mono">Overview Description</label>
                  <textarea
                    rows={3}
                    value={destForm.description}
                    onChange={e => setDestForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Full destination overview..."
                    className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                  />
                </div>

                {/* Rich Content & Inline Multimedia Blocks */}
                <div className="p-4 rounded-xl border border-white/15 bg-white/[0.01]">
                  <RichContentEditor
                    blocks={destForm.contentBlocks}
                    onChange={(blocks) => setDestForm(prev => ({ ...prev, contentBlocks: blocks }))}
                  />
                </div>

                {/* Tourist-Count Pricing Tiers Builder */}
                <div className="p-4 rounded-xl border border-white/15 bg-white/[0.01] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase font-mono text-white flex items-center gap-2">
                        <Users className="w-4 h-4" /> Tourist-Count Pricing Tiers (Server-Enforced)
                      </h4>
                      <p className="text-[11px] text-white/50">
                        Configure non-overlapping guest count brackets (e.g., 1 solo, 2–4 small group, 5–10 group).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDestForm(prev => ({
                        ...prev,
                        touristPricingTiers: [
                          ...prev.touristPricingTiers,
                          { minTourists: 1, maxTourists: 4, priceUgx: prev.basePriceUgx || 850000, pricingMode: 'PER_PERSON', notes: '' },
                        ],
                      }))}
                      className="px-3 py-1.5 bg-white text-black rounded text-xs font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Tier
                    </button>
                  </div>

                  {destForm.touristPricingTiers.map((tier, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end bg-black/50 p-3 rounded-lg border border-white/10">
                      <div>
                        <label className="text-[10px] text-white/50 font-mono">Min Guests</label>
                        <input
                          type="number"
                          min="1"
                          value={tier.minTourists}
                          onChange={e => {
                            const updated = [...destForm.touristPricingTiers];
                            updated[idx] = { ...tier, minTourists: parseInt(e.target.value) || 1 };
                            setDestForm(prev => ({ ...prev, touristPricingTiers: updated }));
                          }}
                          className="w-full mt-1 bg-black border border-white/20 rounded px-2 py-1.5 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/50 font-mono">Max Guests</label>
                        <input
                          type="number"
                          min="1"
                          value={tier.maxTourists}
                          onChange={e => {
                            const updated = [...destForm.touristPricingTiers];
                            updated[idx] = { ...tier, maxTourists: parseInt(e.target.value) || 1 };
                            setDestForm(prev => ({ ...prev, touristPricingTiers: updated }));
                          }}
                          className="w-full mt-1 bg-black border border-white/20 rounded px-2 py-1.5 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/50 font-mono">Price (UGX)</label>
                        <input
                          type="number"
                          step="10000"
                          value={tier.priceUgx}
                          onChange={e => {
                            const updated = [...destForm.touristPricingTiers];
                            updated[idx] = { ...tier, priceUgx: parseInt(e.target.value) || 0 };
                            setDestForm(prev => ({ ...prev, touristPricingTiers: updated }));
                          }}
                          className="w-full mt-1 bg-black border border-white/20 rounded px-2 py-1.5 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/50 font-mono">Mode</label>
                        <select
                          value={tier.pricingMode}
                          onChange={e => {
                            const updated = [...destForm.touristPricingTiers];
                            updated[idx] = { ...tier, pricingMode: e.target.value as any };
                            setDestForm(prev => ({ ...prev, touristPricingTiers: updated }));
                          }}
                          className="w-full mt-1 bg-black border border-white/20 rounded px-2 py-1.5 text-xs text-white font-mono"
                        >
                          <option value="PER_PERSON">Per Person</option>
                          <option value="GROUP_TOTAL">Group Total</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-white/50 font-mono">Notes</label>
                        <input
                          type="text"
                          value={tier.notes || ''}
                          onChange={e => {
                            const updated = [...destForm.touristPricingTiers];
                            updated[idx] = { ...tier, notes: e.target.value };
                            setDestForm(prev => ({ ...prev, touristPricingTiers: updated }));
                          }}
                          placeholder="e.g. Small group"
                          className="w-full mt-1 bg-black border border-white/20 rounded px-2 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setDestForm(prev => ({
                            ...prev,
                            touristPricingTiers: prev.touristPricingTiers.filter((_, i) => i !== idx),
                          }))}
                          className="px-2.5 py-1.5 border border-red-500/30 text-red-400 rounded text-xs hover:bg-red-500/10"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Assigned Vehicles & Guides */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-white/15 bg-white/[0.01] space-y-2">
                    <label className="text-xs font-bold text-white uppercase font-mono flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5" /> Eligible Safari Vehicles (Assigned to Tours)
                    </label>
                    <p className="text-[11px] text-white/40">Select vehicles available for this destination (leave empty to allow all tour-assigned vehicles):</p>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pt-1">
                      {tourVehicles.map(v => (
                        <label key={v.id} className="flex items-center justify-between p-2 rounded border border-white/10 hover:bg-white/[0.03] cursor-pointer text-xs">
                          <span className="flex items-center gap-2 text-white">
                            <input
                              type="checkbox"
                              checked={destForm.assignedVehicleIds.includes(v.id)}
                              onChange={() => setDestForm(prev => ({
                                ...prev,
                                assignedVehicleIds: toggleIdInList(prev.assignedVehicleIds, v.id),
                              }))}
                            />
                            {v.name} ({v.passenger_capacity ?? v.passengerCapacity} pax)
                          </span>
                          <span className="font-mono text-white/60">UGX {Number(v.service_pricing?.tours?.dailyHireRateUgx || 0).toLocaleString()}/day</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-white/15 bg-white/[0.01] space-y-2">
                    <label className="text-xs font-bold text-white uppercase font-mono flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" /> Assigned Certified Tour Guides
                    </label>
                    <p className="text-[11px] text-white/40">Select guides specialized in this destination:</p>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pt-1">
                      {guides.map(g => (
                        <label key={g.id} className="flex items-center justify-between p-2 rounded border border-white/10 hover:bg-white/[0.03] cursor-pointer text-xs">
                          <span className="flex items-center gap-2 text-white">
                            <input
                              type="checkbox"
                              checked={destForm.assignedGuideIds.includes(g.id)}
                              onChange={() => setDestForm(prev => ({
                                ...prev,
                                assignedGuideIds: toggleIdInList(prev.assignedGuideIds, g.id),
                              }))}
                            />
                            {g.name || g.fullName}
                          </span>
                          <span className="font-mono text-white/60">UGX {Number(g.pricePerDayUgx || g.daily_rate_ugx || 0).toLocaleString()}/day</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Coordinates & Travel Info */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Distance</label>
                    <input
                      type="text"
                      value={destForm.distanceFromKampala}
                      onChange={e => setDestForm(prev => ({ ...prev, distanceFromKampala: e.target.value }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Travel Time</label>
                    <input
                      type="text"
                      value={destForm.travelDuration}
                      onChange={e => setDestForm(prev => ({ ...prev, travelDuration: e.target.value }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Rating</label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      value={destForm.rating}
                      onChange={e => setDestForm(prev => ({ ...prev, rating: parseFloat(e.target.value) || 4.8 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Latitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={destForm.latitude}
                      onChange={e => setDestForm(prev => ({ ...prev, latitude: parseFloat(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Longitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={destForm.longitude}
                      onChange={e => setDestForm(prev => ({ ...prev, longitude: parseFloat(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Best Season</label>
                    <input
                      type="text"
                      value={destForm.bestTimeToVisit}
                      onChange={e => setDestForm(prev => ({ ...prev, bestTimeToVisit: e.target.value }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                {/* Highlights, Activities, Inclusions, Exclusions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Key Highlights (1 per line)</label>
                    <textarea
                      rows={3}
                      value={destForm.highlights}
                      onChange={e => setDestForm(prev => ({ ...prev, highlights: e.target.value }))}
                      placeholder="Top of the Falls Hike&#10;Nile River Boat Cruise"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Activities (1 per line)</label>
                    <textarea
                      rows={3}
                      value={destForm.activities}
                      onChange={e => setDestForm(prev => ({ ...prev, activities: e.target.value }))}
                      placeholder="Game Drives&#10;Gorilla Trekking"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Package Inclusions (1 per line)</label>
                    <textarea
                      rows={3}
                      value={destForm.inclusions}
                      onChange={e => setDestForm(prev => ({ ...prev, inclusions: e.target.value }))}
                      placeholder="UWA Park Entrance Fees&#10;4x4 Safari Vehicle & Fuel&#10;Bottled Drinking Water"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Package Exclusions (1 per line)</label>
                    <textarea
                      rows={3}
                      value={destForm.exclusions}
                      onChange={e => setDestForm(prev => ({ ...prev, exclusions: e.target.value }))}
                      placeholder="International Flights&#10;Personal Travel Insurance&#10;Tips & Gratuities"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
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
                    Save &amp; Publish Destination
                  </button>
                </div>
              </form>
            )}

            {/* ── Package Form ── */}
            {activeTab === 'packages' && (
              <form onSubmit={handleSavePackage} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl border border-white/15 bg-white/[0.02]">
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Publication Status</label>
                    <select
                      value={pkgForm.publicationStatus}
                      onChange={e => setPkgForm(prev => ({ ...prev, publicationStatus: e.target.value as any }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white"
                    >
                      <option value="PUBLISHED">PUBLISHED (Live on App)</option>
                      <option value="DRAFT">DRAFT (Hidden from App)</option>
                      <option value="UNPUBLISHED">UNPUBLISHED</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Display Order</label>
                    <input
                      type="number"
                      value={pkgForm.displayOrder}
                      onChange={e => setPkgForm(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pkgForm.bookingAvailable}
                        onChange={e => setPkgForm(prev => ({ ...prev, bookingAvailable: e.target.checked }))}
                        className="rounded border-white/20 bg-black text-white"
                      />
                      <span className="text-xs text-white/80 font-medium">Booking Open</span>
                    </label>
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pkgForm.isFeatured}
                        onChange={e => setPkgForm(prev => ({ ...prev, isFeatured: e.target.checked }))}
                        className="rounded border-white/20 bg-black text-white"
                      />
                      <span className="text-xs text-white/80 font-medium">Featured Package</span>
                    </label>
                  </div>
                </div>

                <ImageUploader
                  label="Package Highlight Image (Cloudflare R2)"
                  value={pkgForm.imageUrl}
                  onChange={(val) => setPkgForm(prev => ({ ...prev, imageUrl: val }))}
                  folder="tourism"
                  recommendedSize="800 x 800 px (Square)"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Target Destination</label>
                    <select
                      value={pkgForm.destinationId}
                      onChange={e => setPkgForm(prev => ({ ...prev, destinationId: e.target.value }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white"
                    >
                      {destinations.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Package Title *</label>
                    <input
                      type="text"
                      required
                      value={pkgForm.title}
                      onChange={e => setPkgForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. 3-Day Gorilla Trekking Safari"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/60 uppercase font-mono">Package Description</label>
                  <textarea
                    rows={3}
                    value={pkgForm.description}
                    onChange={e => setPkgForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Full package details..."
                    className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="p-4 rounded-xl border border-white/15 bg-white/[0.01]">
                  <RichContentEditor
                    blocks={pkgForm.contentBlocks}
                    onChange={(blocks) => setPkgForm(prev => ({ ...prev, contentBlocks: blocks }))}
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
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Base Price (UGX)</label>
                    <input
                      type="number"
                      step="50000"
                      value={pkgForm.priceUgx}
                      onChange={e => setPkgForm(prev => ({ ...prev, priceUgx: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Display Price (USD)</label>
                    <input
                      type="number"
                      step="10"
                      value={pkgForm.priceUsd}
                      onChange={e => setPkgForm(prev => ({ ...prev, priceUsd: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                {/* Package Tourist Pricing Tiers */}
                <div className="p-4 rounded-xl border border-white/15 bg-white/[0.01] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase font-mono text-white flex items-center gap-2">
                        <Users className="w-4 h-4" /> Tourist-Count Pricing Tiers
                      </h4>
                      <p className="text-[11px] text-white/50">Configure non-overlapping guest count brackets for this package.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPkgForm(prev => ({
                        ...prev,
                        touristPricingTiers: [
                          ...prev.touristPricingTiers,
                          { minTourists: 1, maxTourists: 4, priceUgx: prev.priceUgx || 1200000, pricingMode: 'PER_PERSON', notes: '' },
                        ],
                      }))}
                      className="px-3 py-1.5 bg-white text-black rounded text-xs font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Tier
                    </button>
                  </div>

                  {pkgForm.touristPricingTiers.map((tier, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end bg-black/50 p-3 rounded-lg border border-white/10">
                      <div>
                        <label className="text-[10px] text-white/50 font-mono">Min Guests</label>
                        <input
                          type="number"
                          min="1"
                          value={tier.minTourists}
                          onChange={e => {
                            const updated = [...pkgForm.touristPricingTiers];
                            updated[idx] = { ...tier, minTourists: parseInt(e.target.value) || 1 };
                            setPkgForm(prev => ({ ...prev, touristPricingTiers: updated }));
                          }}
                          className="w-full mt-1 bg-black border border-white/20 rounded px-2 py-1.5 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/50 font-mono">Max Guests</label>
                        <input
                          type="number"
                          min="1"
                          value={tier.maxTourists}
                          onChange={e => {
                            const updated = [...pkgForm.touristPricingTiers];
                            updated[idx] = { ...tier, maxTourists: parseInt(e.target.value) || 1 };
                            setPkgForm(prev => ({ ...prev, touristPricingTiers: updated }));
                          }}
                          className="w-full mt-1 bg-black border border-white/20 rounded px-2 py-1.5 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/50 font-mono">Price (UGX)</label>
                        <input
                          type="number"
                          step="10000"
                          value={tier.priceUgx}
                          onChange={e => {
                            const updated = [...pkgForm.touristPricingTiers];
                            updated[idx] = { ...tier, priceUgx: parseInt(e.target.value) || 0 };
                            setPkgForm(prev => ({ ...prev, touristPricingTiers: updated }));
                          }}
                          className="w-full mt-1 bg-black border border-white/20 rounded px-2 py-1.5 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/50 font-mono">Mode</label>
                        <select
                          value={tier.pricingMode}
                          onChange={e => {
                            const updated = [...pkgForm.touristPricingTiers];
                            updated[idx] = { ...tier, pricingMode: e.target.value as any };
                            setPkgForm(prev => ({ ...prev, touristPricingTiers: updated }));
                          }}
                          className="w-full mt-1 bg-black border border-white/20 rounded px-2 py-1.5 text-xs text-white font-mono"
                        >
                          <option value="PER_PERSON">Per Person</option>
                          <option value="GROUP_TOTAL">Group Total</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-white/50 font-mono">Notes</label>
                        <input
                          type="text"
                          value={tier.notes || ''}
                          onChange={e => {
                            const updated = [...pkgForm.touristPricingTiers];
                            updated[idx] = { ...tier, notes: e.target.value };
                            setPkgForm(prev => ({ ...prev, touristPricingTiers: updated }));
                          }}
                          className="w-full mt-1 bg-black border border-white/20 rounded px-2 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setPkgForm(prev => ({
                            ...prev,
                            touristPricingTiers: prev.touristPricingTiers.filter((_, i) => i !== idx),
                          }))}
                          className="px-2.5 py-1.5 border border-red-500/30 text-red-400 rounded text-xs hover:bg-red-500/10"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Inclusions (1 per line)</label>
                    <textarea
                      rows={3}
                      value={pkgForm.inclusions}
                      onChange={e => setPkgForm(prev => ({ ...prev, inclusions: e.target.value }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Exclusions (1 per line)</label>
                    <textarea
                      rows={3}
                      value={pkgForm.exclusions}
                      onChange={e => setPkgForm(prev => ({ ...prev, exclusions: e.target.value }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Expedition Itinerary (1 step per line)</label>
                    <textarea
                      rows={3}
                      value={pkgForm.itinerarySummary}
                      onChange={e => setPkgForm(prev => ({ ...prev, itinerarySummary: e.target.value }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
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
                    Save &amp; Publish Package
                  </button>
                </div>
              </form>
            )}

            {/* ── Guide Form ── */}
            {activeTab === 'guides' && (
              <form onSubmit={handleSaveGuide} className="space-y-4">
                <ImageUploader
                  label="Guide Portrait / Avatar (Cloudflare R2)"
                  value={guideForm.avatarUrl}
                  onChange={(val) => setGuideForm(prev => ({ ...prev, avatarUrl: val }))}
                  folder="tourism"
                  recommendedSize="600 x 600 px (Square portrait)"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Guide Full Name *</label>
                    <input
                      type="text"
                      required
                      value={guideForm.name}
                      onChange={e => setGuideForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Kenneth Byaruhanga"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Phone Number *</label>
                    <input
                      type="text"
                      required
                      value={guideForm.phone}
                      onChange={e => setGuideForm(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="+256 700 000000"
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/60 uppercase font-mono">Bio &amp; Qualifications</label>
                  <textarea
                    rows={2}
                    value={guideForm.bio}
                    onChange={e => setGuideForm(prev => ({ ...prev, bio: e.target.value }))}
                    placeholder="UWA certified safari guide..."
                    className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Languages (comma-separated)</label>
                    <input
                      type="text"
                      value={guideForm.languages}
                      onChange={e => setGuideForm(prev => ({ ...prev, languages: e.target.value }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase font-mono">Specialties (comma-separated)</label>
                    <input
                      type="text"
                      value={guideForm.specialties}
                      onChange={e => setGuideForm(prev => ({ ...prev, specialties: e.target.value }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Experience (Yrs)</label>
                    <input
                      type="number"
                      min="1"
                      value={guideForm.yearsOfExperience}
                      onChange={e => setGuideForm(prev => ({ ...prev, yearsOfExperience: parseInt(e.target.value) || 1 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Daily Fee (UGX)</label>
                    <input
                      type="number"
                      step="10000"
                      value={guideForm.pricePerDayUgx}
                      onChange={e => setGuideForm(prev => ({ ...prev, pricePerDayUgx: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Multi-Day Rate (UGX)</label>
                    <input
                      type="number"
                      step="10000"
                      value={guideForm.multiDayRateUgx}
                      onChange={e => setGuideForm(prev => ({ ...prev, multiDayRateUgx: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Fixed Fee (UGX)</label>
                    <input
                      type="number"
                      step="10000"
                      value={guideForm.fixedTourFeeUgx}
                      onChange={e => setGuideForm(prev => ({ ...prev, fixedTourFeeUgx: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/60 uppercase font-mono">Group Surcharge (&gt;4 pax)</label>
                    <input
                      type="number"
                      step="5000"
                      value={guideForm.groupSizeSurchargeUgx}
                      onChange={e => setGuideForm(prev => ({ ...prev, groupSizeSurchargeUgx: parseInt(e.target.value) || 0 }))}
                      className="w-full mt-1 bg-black border border-white/20 rounded-md px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={guideForm.isCertified}
                      onChange={e => setGuideForm(prev => ({ ...prev, isCertified: e.target.checked }))}
                      className="rounded border-white/20 bg-black text-white"
                    />
                    <span className="text-xs text-white/80">Certified Guide Badge</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={guideForm.isAvailable}
                      onChange={e => setGuideForm(prev => ({ ...prev, isAvailable: e.target.checked }))}
                      className="rounded border-white/20 bg-black text-white"
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
