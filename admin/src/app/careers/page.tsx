'use client';

import React, { useState, useEffect } from 'react';
import { 
  Car, 
  Compass, 
  ShieldCheck, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  FileText, 
  Award, 
  Phone, 
  Mail, 
  MapPin, 
  ChevronRight, 
  ArrowLeft,
  X,
  ExternalLink,
  Briefcase,
  Users,
  Calendar,
  Lock,
  Radio,
  Activity,
  KeyRound,
  Shield,
  Check,
  RotateCw,
  LogOut,
  Navigation
} from 'lucide-react';
import { api } from '@/lib/api';

type ApplicationTrack = 'driver' | 'tour_guide';
type PortalStep = 'login' | 'setup_password' | 'dashboard';

export default function CareersPage() {
  const [activeTab, setActiveTab] = useState<'apply' | 'status' | 'portal' | 'requirements'>('apply');
  const [track, setTrack] = useState<ApplicationTrack>('driver');
  
  // Application Form State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [operatingCity, setOperatingCity] = useState('Kampala');
  
  // Driver-specific fields
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseClass, setLicenseClass] = useState('Class B / CM');
  const [experienceYears, setExperienceYears] = useState('3');
  const [vehicleMake, setVehicleMake] = useState('Toyota');
  const [vehicleModel, setVehicleModel] = useState('Land Cruiser Prado 4x4');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleTier, setVehicleTier] = useState('safari_4x4');
  
  // Guide-specific fields
  const [uwaNumber, setUwaNumber] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['English', 'Luganda']);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>(['Savannah Wildlife Safari', 'Gorilla Trekking']);
  
  // Documents
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  
  // Submission & Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Status Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [statusResult, setStatusResult] = useState<any | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Partner Portal & Dashboard State
  const [portalStep, setPortalStep] = useState<PortalStep>('login');
  const [portalEmail, setPortalEmail] = useState('');
  const [portalOtp, setPortalOtp] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const [setupToken, setSetupToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [portalUser, setPortalUser] = useState<any | null>(null);
  const [portalAuthToken, setPortalAuthToken] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [statusUpdating, setStatusUpdating] = useState<boolean>(false);

  // Location Telemetry State
  const [currentLat, setCurrentLat] = useState<number>(0.3136);
  const [currentLng, setCurrentLng] = useState<number>(32.5811);
  const [heading, setHeading] = useState<number>(90);
  const [speed, setSpeed] = useState<number>(25);
  const [lastLocationPing, setLastLocationPing] = useState<string | null>(null);
  const [transmittingGps, setTransmittingGps] = useState<boolean>(false);
  const [gpsFeedback, setGpsFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    // Check saved session
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem('safaris_partner_token');
      const savedUser = localStorage.getItem('safaris_partner_user');
      if (savedToken && savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          setPortalUser(parsed);
          setPortalAuthToken(savedToken);
          setIsOnline(parsed.driver_details?.is_online || false);
          if (parsed.driver_details?.current_lat) {
            setCurrentLat(parsed.driver_details.current_lat);
            setCurrentLng(parsed.driver_details.current_lng);
          }
          setPortalStep('dashboard');
        } catch (_) {}
      }
    }
  }, []);

  const availableLanguages = [
    'English', 'Swahili', 'Luganda', 'French', 'German', 'Spanish', 'Italian', 'Chinese'
  ];

  const availableSpecialties = [
    'Savannah Wildlife Safari', 
    'Gorilla Trekking', 
    'Chimpanzee Tracking', 
    'Bird Watching (Avian Safari)', 
    'Cultural & Heritage Tours', 
    'Mountaineering (Rwenzori/Elgon)',
    'Water Rafting & Adventure'
  ];

  const handleLanguageToggle = (lang: string) => {
    setSelectedLanguages(prev => 
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const handleSpecialtyToggle = (spec: string) => {
    setSelectedSpecialties(prev => 
      prev.includes(spec) ? prev.filter(s => s !== spec) : [...prev, spec]
    );
  };

  const handleFileUpload = (docKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert('File size exceeds 25MB limit. Please upload a smaller scan or photo.');
      return;
    }

    setUploadingDoc(docKey);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setDocuments(prev => ({ ...prev, [docKey]: dataUrl }));
      setUploadingDoc(null);
    };
    reader.onerror = () => {
      alert('Failed to read file. Please try again.');
      setUploadingDoc(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!agreedToTerms) {
      setErrorMessage('You must review and agree to the Mumwe Safaris Code of Conduct and Road Safety standards.');
      return;
    }

    if (!fullName.trim() || !phone.trim() || !email.trim()) {
      setErrorMessage('Full legal name, phone number, and email address are required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: any = {
        applicant_type: track,
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        national_id: nationalId.trim(),
        experience_years: parseInt(experienceYears, 10) || 0,
        documents,
      };

      if (track === 'driver') {
        payload.license_number = licenseNumber.trim();
        payload.vehicle_make = vehicleMake.trim();
        payload.vehicle_model = vehicleModel.trim();
        payload.vehicle_plate = vehiclePlate.trim().toUpperCase();
        payload.vehicle_tier = vehicleTier;
      } else {
        payload.license_number = uwaNumber.trim();
        payload.languages = selectedLanguages;
        payload.specialties = selectedSpecialties;
      }

      const res = await api.submitCareerApplication(payload);
      setSubmissionSuccess(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('[Career Application Error]', err);
      setErrorMessage(err.message || 'Failed to submit application. Please check your details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setStatusError(null);
    setStatusResult(null);

    try {
      const res = await api.checkCareerStatus(searchQuery.trim());
      setStatusResult(res);
    } catch (err: any) {
      console.error('[Status Search Error]', err);
      setStatusError(err.message || 'Application not found. Please verify your reference number or email.');
    } finally {
      setIsSearching(false);
    }
  };

  // --------------------------------------------------------------------------
  // Partner Portal: Step 1 — OTP Login
  // --------------------------------------------------------------------------
  const handleOtpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalEmail.trim() || !portalOtp.trim()) {
      setPortalError('Please enter both your registered email address and the 6-digit OTP code.');
      return;
    }

    setPortalLoading(true);
    setPortalError(null);

    try {
      const res = await api.loginWithOtp(portalEmail.trim().toLowerCase(), portalOtp.trim());
      if (res.requiresPasswordSetup && res.setupToken) {
        setSetupToken(res.setupToken);
        setPortalUser(res.user);
        setPortalStep('setup_password');
      } else if (res.accessToken) {
        setPortalUser(res.user);
        setPortalAuthToken(res.accessToken);
        setIsOnline(res.user?.driver_details?.is_online || false);
        if (typeof window !== 'undefined') {
          localStorage.setItem('safaris_partner_token', res.accessToken);
          localStorage.setItem('safaris_partner_user', JSON.stringify(res.user));
        }
        setPortalStep('dashboard');
      }
    } catch (err: any) {
      setPortalError(err.message || 'Login failed. Please verify your OTP code or check if application is approved.');
    } finally {
      setPortalLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Partner Portal: Step 2 — Set Permanent Password
  // --------------------------------------------------------------------------
  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setSetupError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setSetupError('Passwords do not match. Please re-enter.');
      return;
    }

    setSetupLoading(true);
    setSetupError(null);

    try {
      const res = await api.setupPassword(portalEmail.trim().toLowerCase(), setupToken, newPassword);
      setPortalUser(res.user);
      setPortalAuthToken(res.accessToken);
      setIsOnline(res.user?.driver_details?.is_online || false);
      if (typeof window !== 'undefined') {
        localStorage.setItem('safaris_partner_token', res.accessToken);
        localStorage.setItem('safaris_partner_user', JSON.stringify(res.user));
      }
      setPortalStep('dashboard');
    } catch (err: any) {
      setSetupError(err.message || 'Failed to set password. Please try again.');
    } finally {
      setSetupLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Partner Portal: Step 3 — Toggle Status & Transmit Location
  // --------------------------------------------------------------------------
  const handleToggleOnline = async () => {
    if (!portalAuthToken) return;
    setStatusUpdating(true);
    try {
      const nextStatus = !isOnline;
      await api.setDriverAvailability(nextStatus, portalAuthToken);
      setIsOnline(nextStatus);
    } catch (err: any) {
      alert(err.message || 'Failed to update online status.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleTransmitGps = async () => {
    setTransmittingGps(true);
    setGpsFeedback(null);

    // Try HTML5 Geolocation or use configured coordinates
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = parseFloat(pos.coords.latitude.toFixed(6));
          const lng = parseFloat(pos.coords.longitude.toFixed(6));
          const hdg = pos.coords.heading || heading;
          const spd = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : speed;
          setCurrentLat(lat);
          setCurrentLng(lng);
          setHeading(hdg);
          setSpeed(spd);
          await sendLocationToBackend(lat, lng, hdg);
        },
        async () => {
          // Fallback to current state coordinates (e.g. Kampala)
          await sendLocationToBackend(currentLat, currentLng, heading);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      await sendLocationToBackend(currentLat, currentLng, heading);
    }
  };

  const sendLocationToBackend = async (lat: number, lng: number, hdg: number) => {
    try {
      await api.updateDriverLocation(lat, lng, hdg, portalAuthToken);
      const timestamp = new Date().toLocaleTimeString();
      setLastLocationPing(timestamp);
      setGpsFeedback({
        text: `✓ Live GPS transmitted to Mumwe Safaris Dispatch: ${lat}, ${lng} at ${timestamp}. Admin map is now updated.`,
        type: 'success',
      });
    } catch (err: any) {
      setGpsFeedback({
        text: err.message || 'Failed to transmit location to dispatch server.',
        type: 'error',
      });
    } finally {
      setTransmittingGps(false);
    }
  };

  const handlePortalLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('safaris_partner_token');
      localStorage.removeItem('safaris_partner_user');
    }
    setPortalUser(null);
    setPortalAuthToken('');
    setPortalStep('login');
    setPortalEmail('');
    setPortalOtp('');
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-amber-500 selection:text-black">
      {/* Top Header */}
      <header className="border-b border-white/10 bg-black/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400 tracking-wider">
              M
            </div>
            <div>
              <span className="font-bold tracking-wider text-sm block text-white">MUMWE SAFARIS UGANDA</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 block">Careers & Partner Portal</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setActiveTab('apply'); setSubmissionSuccess(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'apply' 
                  ? 'bg-amber-500 text-black font-bold' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5 text-amber-400" />
              Apply Online
            </button>
            <button
              onClick={() => setActiveTab('status')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'status' 
                  ? 'bg-amber-500 text-black font-bold' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-amber-400" />
              Track Status
            </button>
            <button
              onClick={() => setActiveTab('portal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'portal' 
                  ? 'bg-amber-500 text-black font-bold' 
                  : 'text-white/70 hover:text-white hover:bg-white/5 border border-amber-500/30'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              Partner & Driver Portal
            </button>
            <button
              onClick={() => setActiveTab('requirements')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'requirements' 
                  ? 'bg-amber-500 text-black font-bold' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              Requirements
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        
        {/* ================================================================= */}
        {/* TAB 1: APPLY ONLINE */}
        {/* ================================================================= */}
        {activeTab === 'apply' && (
          <div>
            {submissionSuccess ? (
              <div className="max-w-2xl mx-auto text-center py-12 px-6 rounded-3xl bg-[#0a0a0c] border border-amber-500/30 shadow-2xl space-y-6">
                <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">Application Successfully Submitted</h2>
                  <p className="text-xs text-white/60 font-mono mt-1">
                    Application Reference: <span className="text-amber-400 font-bold">{submissionSuccess.applicationId}</span>
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-left text-xs space-y-3 font-mono">
                  <div className="flex justify-between border-b border-white/10 pb-2">
                    <span className="text-white/50">Applicant Name</span>
                    <span className="text-white font-bold">{fullName}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 pb-2">
                    <span className="text-white/50">Role / Track</span>
                    <span className="text-amber-400 font-bold uppercase">{track === 'driver' ? 'Safari Chauffeur' : 'Tour Guide'}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 pb-2">
                    <span className="text-white/50">Contact Email</span>
                    <span className="text-white">{email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Initial Review Status</span>
                    <span className="text-amber-300 font-bold">PENDING APPROVAL</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 text-left space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                    What Happens Next:
                  </div>
                  <p className="leading-relaxed">
                    1. Mumwe Safaris operations team will review your permit, NIN, and submitted documents.<br/>
                    2. Once approved, an automated activation email containing your <strong>One-Time Passcode (OTP)</strong> will be dispatched to <strong>{email}</strong>.<br/>
                    3. You will log in using your email and OTP, create your password, and enter your live dashboard!
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => { setActiveTab('status'); setSearchQuery(submissionSuccess.applicationId); }}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider flex items-center gap-2"
                  >
                    <Search className="w-4 h-4 text-black" />
                    Track Review Status
                  </button>
                  <button
                    onClick={() => { setSubmissionSuccess(null); setActiveTab('apply'); }}
                    className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-mono"
                  >
                    Submit Another Application
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Hero Banner */}
                <div className="relative rounded-3xl bg-gradient-to-b from-white/[0.05] to-black border border-white/10 p-8 sm:p-12 overflow-hidden text-center max-w-4xl mx-auto">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono mb-4">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    Official Partner Recruitment Platform
                  </div>
                  <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white max-w-2xl mx-auto leading-tight">
                    Drive and Guide with <span className="text-amber-400">Mumwe Safaris</span>
                  </h1>
                  <p className="text-sm sm:text-base text-white/60 max-w-xl mx-auto mt-4 leading-relaxed">
                    Join Uganda’s premier wildlife and safari mobility network. Guaranteed daily bookings, premium tourist clientele, and verified digital dispatch across all national parks and cities.
                  </p>

                  {/* Track Selector */}
                  <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mt-8">
                    <button
                      type="button"
                      onClick={() => setTrack('driver')}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        track === 'driver'
                          ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                      }`}
                    >
                      <Car className="w-6 h-6 text-amber-400 mb-2" />
                      <div className="font-bold text-sm text-white">Safari Driver / Chauffeur</div>
                      <div className="text-[11px] text-white/50 mt-1">4x4 Fleet, Airport Transfers & City Rides</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTrack('tour_guide')}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        track === 'tour_guide'
                          ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                      }`}
                    >
                      <Compass className="w-6 h-6 text-amber-400 mb-2" />
                      <div className="font-bold text-sm text-white">Licensed Tour Guide</div>
                      <div className="text-[11px] text-white/50 mt-1">Wildlife Expeditions & Gorilla Trekking</div>
                    </button>
                  </div>
                </div>

                {/* Form Container */}
                <div className="max-w-3xl mx-auto rounded-3xl bg-[#090a0d] border border-white/10 p-6 sm:p-10">
                  <form onSubmit={handleSubmitApplication} className="space-y-8">
                    {errorMessage && (
                      <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    {/* Section 1: Personal Info */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                        <Users className="w-4 h-4 text-amber-400" />
                        <h3 className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold">1. Personal & Contact Details</h3>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-white/70 block mb-1">Full Legal Name *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Denis Kiggundu"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-white/70 block mb-1">Primary Phone Number (MTN/Airtel) *</label>
                          <input
                            type="tel"
                            required
                            placeholder="+256 700 000 000"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-white/70 block mb-1">Official Email Address *</label>
                          <input
                            type="email"
                            required
                            placeholder="denis@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none"
                          />
                          <span className="text-[10px] text-white/40 mt-1 block">Your activation OTP and login credentials will be delivered here.</span>
                        </div>

                        <div>
                          <label className="text-xs text-white/70 block mb-1">National ID (NIN) or Passport Number *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. CM920384758392"
                            value={nationalId}
                            onChange={(e) => setNationalId(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none uppercase font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Role Details */}
                    {track === 'driver' ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                          <Car className="w-4 h-4 text-amber-400" />
                          <h3 className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold">2. Driving Accreditation & Vehicle Information</h3>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="text-xs text-white/70 block mb-1">Driving Permit Number *</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. DL-UG-984321"
                              value={licenseNumber}
                              onChange={(e) => setLicenseNumber(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-white/70 block mb-1">Permit Class</label>
                            <select
                              value={licenseClass}
                              onChange={(e) => setLicenseClass(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none"
                            >
                              <option value="Class B / CM">Class B / CM (Passenger Vehicle)</option>
                              <option value="Class DL / DM">Class DL / DM (Tour Coach & Van)</option>
                              <option value="Class A">Class A (Motorcycle Courier)</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-xs text-white/70 block mb-1">Commercial Experience (Years)</label>
                            <input
                              type="number"
                              min="1"
                              max="40"
                              value={experienceYears}
                              onChange={(e) => setExperienceYears(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-white/70 block mb-1">Vehicle Make *</label>
                            <input
                              type="text"
                              required
                              placeholder="Toyota"
                              value={vehicleMake}
                              onChange={(e) => setVehicleMake(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-white/70 block mb-1">Vehicle Model *</label>
                            <input
                              type="text"
                              required
                              placeholder="Land Cruiser Prado"
                              value={vehicleModel}
                              onChange={(e) => setVehicleModel(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-white/70 block mb-1">Registration Plate Number *</label>
                            <input
                              type="text"
                              required
                              placeholder="UBD 123A"
                              value={vehiclePlate}
                              onChange={(e) => setVehiclePlate(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none font-mono uppercase"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-white/70 block mb-1">Vehicle Classification Tier</label>
                          <select
                            value={vehicleTier}
                            onChange={(e) => setVehicleTier(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none"
                          >
                            <option value="safari_4x4">Safari 4x4 (Land Cruiser, Super Custom, Prado)</option>
                            <option value="go">Mumwe Go (Standard Sedan / Compact)</option>
                            <option value="comfort">Mumwe Comfort (Executive Sedan)</option>
                            <option value="xl">Mumwe XL (6-8 Seater Minivan)</option>
                            <option value="delivery">Package Courier Van</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                          <Compass className="w-4 h-4 text-amber-400" />
                          <h3 className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold">2. Guiding Credentials & Specialties</h3>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-white/70 block mb-1">UWA / UTB Guide Accreditation ID</label>
                            <input
                              type="text"
                              placeholder="e.g. UWA-TG-2024-893"
                              value={uwaNumber}
                              onChange={(e) => setUwaNumber(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none font-mono uppercase"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-white/70 block mb-1">Guiding Experience (Years)</label>
                            <input
                              type="number"
                              min="1"
                              max="40"
                              value={experienceYears}
                              onChange={(e) => setExperienceYears(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-white/70 block mb-2">Fluent Languages</label>
                          <div className="flex flex-wrap gap-2">
                            {availableLanguages.map((lang) => {
                              const active = selectedLanguages.includes(lang);
                              return (
                                <button
                                  type="button"
                                  key={lang}
                                  onClick={() => handleLanguageToggle(lang)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                                    active
                                      ? 'bg-amber-500 text-black font-bold border border-amber-400'
                                      : 'bg-white/5 text-white/70 border border-white/10 hover:border-white/20'
                                  }`}
                                >
                                  {lang} {active && '✓'}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-white/70 block mb-2">Safari Specialties</label>
                          <div className="flex flex-wrap gap-2">
                            {availableSpecialties.map((spec) => {
                              const active = selectedSpecialties.includes(spec);
                              return (
                                <button
                                  type="button"
                                  key={spec}
                                  onClick={() => handleSpecialtyToggle(spec)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                                    active
                                      ? 'bg-amber-500 text-black font-bold border border-amber-400'
                                      : 'bg-white/5 text-white/70 border border-white/10 hover:border-white/20'
                                  }`}
                                >
                                  {spec} {active && '✓'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Section 3: Document Attachments */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                        <Upload className="w-4 h-4 text-amber-400" />
                        <h3 className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold">3. Verification Document Uploads (Images or PDFs)</h3>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Driving Permit or UWA Badge */}
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-white">
                              {track === 'driver' ? 'Uganda Driving Permit (Front & Back)' : 'UWA Guide License Scan'} *
                            </span>
                            {documents.license && <span className="text-[10px] text-amber-400 font-mono">Uploaded ✓</span>}
                          </div>
                          <label className="cursor-pointer block text-center py-4 border border-dashed border-white/20 rounded-xl hover:border-amber-400 transition-colors">
                            <Upload className="w-5 h-5 mx-auto text-amber-400 mb-1" />
                            <span className="text-[11px] text-white/60">Click to select scan / PDF</span>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => handleFileUpload('license', e)}
                              className="hidden"
                            />
                          </label>
                        </div>

                        {/* National ID / Passport */}
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-white">National ID Card (NIN) / Passport *</span>
                            {documents.national_id && <span className="text-[10px] text-amber-400 font-mono">Uploaded ✓</span>}
                          </div>
                          <label className="cursor-pointer block text-center py-4 border border-dashed border-white/20 rounded-xl hover:border-amber-400 transition-colors">
                            <Upload className="w-5 h-5 mx-auto text-amber-400 mb-1" />
                            <span className="text-[11px] text-white/60">Click to select scan / PDF</span>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => handleFileUpload('national_id', e)}
                              className="hidden"
                            />
                          </label>
                        </div>

                        {/* Logbook or Accreditation */}
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-white">
                              {track === 'driver' ? 'Vehicle Logbook & Insurance Certificate' : 'First Aid / Conservation Certificate'}
                            </span>
                            {documents.logbook && <span className="text-[10px] text-amber-400 font-mono">Uploaded ✓</span>}
                          </div>
                          <label className="cursor-pointer block text-center py-4 border border-dashed border-white/20 rounded-xl hover:border-amber-400 transition-colors">
                            <Upload className="w-5 h-5 mx-auto text-amber-400 mb-1" />
                            <span className="text-[11px] text-white/60">Click to select scan / PDF</span>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => handleFileUpload('logbook', e)}
                              className="hidden"
                            />
                          </label>
                        </div>

                        {/* Candidate Passport Photo */}
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-white">Passport Photo / Driver Portrait *</span>
                            {documents.avatar && <span className="text-[10px] text-amber-400 font-mono">Uploaded ✓</span>}
                          </div>
                          <label className="cursor-pointer block text-center py-4 border border-dashed border-white/20 rounded-xl hover:border-amber-400 transition-colors">
                            <Upload className="w-5 h-5 mx-auto text-amber-400 mb-1" />
                            <span className="text-[11px] text-white/60">Click to select photo</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleFileUpload('avatar', e)}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Terms & Submit */}
                    <div className="pt-4 border-t border-white/10 space-y-4">
                      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 flex items-start gap-3">
                        <input
                          type="checkbox"
                          id="terms"
                          checked={agreedToTerms}
                          onChange={(e) => setAgreedToTerms(e.target.checked)}
                          className="mt-1 w-4 h-4 rounded border-white/30 text-amber-500 focus:ring-0 bg-black cursor-pointer"
                        />
                        <label htmlFor="terms" className="text-xs text-white/70 leading-relaxed cursor-pointer">
                          I declare that all submitted credentials and attached documents are authentic and valid. I agree to abide by the <strong className="text-white">Mumwe Safaris Tourist Safety Code of Conduct</strong> and Uganda Wildlife Authority park regulations.
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm tracking-wider uppercase transition-all shadow-xl shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <ShieldCheck className="w-4 h-4 text-black" />
                        {isSubmitting ? 'Verifying & Submitting...' : 'Submit Official Application'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: TRACK STATUS */}
        {/* ================================================================= */}
        {activeTab === 'status' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-white">Application Review Status</h2>
              <p className="text-xs text-white/60">
                Track your vetting progress, permit verification, and recruitment approval in real-time.
              </p>
            </div>

            <form onSubmit={handleStatusSearch} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Enter Application Reference ID (e.g. app_9a8b7c6d) or Email"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none font-mono"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
              >
                <Search className="w-4 h-4 text-black" />
                {isSearching ? 'Checking...' : 'Check Status'}
              </button>
            </form>

            {statusError && (
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <span>{statusError}</span>
              </div>
            )}

            {statusResult && (
              <div className="p-6 rounded-2xl bg-[#0a0a0c] border border-white/15 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <h3 className="font-bold text-white text-base">{statusResult.full_name}</h3>
                    <span className="text-[11px] font-mono text-white/40">{statusResult.email} • {statusResult.phone}</span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold ${
                    statusResult.status === 'APPROVED'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : statusResult.status === 'REJECTED'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                      : 'bg-white/10 text-white/80 border border-white/20'
                  }`}>
                    {statusResult.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div>
                    <span className="text-white/40 block text-[10px]">APPLICATION ID</span>
                    <span className="text-white font-bold">{statusResult.id}</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[10px]">TRACK</span>
                    <span className="text-amber-400 font-bold uppercase">{statusResult.applicant_type}</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[10px]">EXPERIENCE</span>
                    <span className="text-white">{statusResult.experience_years} Years</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[10px]">SUBMISSION DATE</span>
                    <span className="text-white">{new Date(statusResult.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {statusResult.status === 'APPROVED' && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-2">
                    <div className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                      Congratulations! Your Application is Approved.
                    </div>
                    <p className="text-[11px] text-white/80 leading-relaxed">
                      Your credentials have been verified. An activation code has been sent to your email. You can now switch to the <strong>Partner & Driver Portal</strong> tab to log in with your OTP and access your live dashboard.
                    </p>
                    <button
                      onClick={() => {
                        setPortalEmail(statusResult.email);
                        setActiveTab('portal');
                      }}
                      className="px-4 py-2 rounded-lg bg-amber-500 text-black font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 mt-2"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-black" />
                      Open Partner Portal to Set Password
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: PARTNER & DRIVER PORTAL (OTP LOGIN -> PASSWORD -> DASHBOARD) */}
        {/* ================================================================= */}
        {activeTab === 'portal' && (
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* STEP 1: OTP LOGIN */}
            {portalStep === 'login' && (
              <div className="max-w-md mx-auto p-8 rounded-3xl bg-[#090a0d] border border-white/10 shadow-2xl space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                    <KeyRound className="w-6 h-6 text-amber-400" />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-white">Partner & Driver Login</h2>
                  <p className="text-xs text-white/60">
                    Enter your approved email and the 6-digit OTP code sent to your inbox upon approval.
                  </p>
                </div>

                {portalError && (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{portalError}</span>
                  </div>
                )}

                <form onSubmit={handleOtpLogin} className="space-y-4">
                  <div>
                    <label className="text-xs text-white/70 block mb-1">Registered Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="driver@example.com"
                      value={portalEmail}
                      onChange={(e) => setPortalEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-white/70 block mb-1">6-Digit Activation Code (OTP)</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="123456"
                      value={portalOtp}
                      onChange={(e) => setPortalOtp(e.target.value.trim())}
                      className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-amber-400 text-lg font-mono text-center tracking-widest focus:border-amber-400 focus:outline-none font-bold"
                    />
                    <span className="text-[10px] text-white/40 mt-1 block">Check your spam folder if you do not see the activation email in your inbox.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={portalLoading}
                    className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4 text-black" />
                    {portalLoading ? 'Verifying OTP...' : 'Verify OTP & Proceed'}
                  </button>
                </form>
              </div>
            )}

            {/* STEP 2: SET PERMANENT PASSWORD */}
            {portalStep === 'setup_password' && (
              <div className="max-w-md mx-auto p-8 rounded-3xl bg-[#090a0d] border border-amber-500/30 shadow-2xl space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                    <Lock className="w-6 h-6 text-amber-400" />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-white">Create Your Permanent Password</h2>
                  <p className="text-xs text-white/60">
                    Your credentials have been verified. Set a secure password to access your driver dashboard anytime.
                  </p>
                </div>

                {setupError && (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{setupError}</span>
                  </div>
                )}

                <form onSubmit={handleSetupPassword} className="space-y-4">
                  <div>
                    <label className="text-xs text-white/70 block mb-1">New Password (Min. 6 characters)</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-white/70 block mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-black border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={setupLoading}
                    className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4 text-black" />
                    {setupLoading ? 'Saving Password...' : 'Save Password & Enter Dashboard'}
                  </button>
                </form>
              </div>
            )}

            {/* STEP 3: DRIVER & GUIDE DASHBOARD */}
            {portalStep === 'dashboard' && portalUser && (
              <div className="space-y-6">
                {/* Dashboard Header Bar */}
                <div className="p-6 rounded-3xl bg-[#090a0d] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xl uppercase">
                      {portalUser.full_name?.substring(0, 2) || 'MS'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-white">{portalUser.full_name}</h2>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
                          {portalUser.role === 'driver' ? 'Verified Driver' : 'Licensed Guide'}
                        </span>
                      </div>
                      <p className="text-xs text-white/50 font-mono mt-0.5">
                        {portalUser.email} • {portalUser.phone}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    <button
                      onClick={handleToggleOnline}
                      disabled={statusUpdating}
                      className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                        isOnline
                          ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                          : 'bg-white/10 hover:bg-white/15 text-white/70'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-black animate-pulse' : 'bg-white/40'}`} />
                      {statusUpdating ? 'Updating...' : isOnline ? 'Online & Active' : 'Go Online'}
                    </button>
                    <button
                      onClick={handlePortalLogout}
                      className="p-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-white/60 hover:text-white"
                      title="Log Out"
                    >
                      <LogOut className="w-4 h-4 text-amber-400" />
                    </button>
                  </div>
                </div>

                {/* Dashboard Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Card 1: Equipment / Credentials */}
                  <div className="p-6 rounded-3xl bg-[#090a0d] border border-white/10 space-y-4">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                      <Car className="w-4 h-4 text-amber-400" />
                      <h3 className="font-bold text-white text-xs uppercase tracking-wider">Accreditation & Specs</h3>
                    </div>

                    {portalUser.role === 'driver' ? (
                      <div className="space-y-3 text-xs font-mono">
                        <div>
                          <span className="text-white/40 block text-[10px]">VEHICLE</span>
                          <span className="text-white font-bold">{portalUser.vehicle_details?.make || 'Toyota'} {portalUser.vehicle_details?.model || 'Safari 4x4'}</span>
                        </div>
                        <div>
                          <span className="text-white/40 block text-[10px]">PLATE NUMBER</span>
                          <span className="text-amber-400 font-bold">{portalUser.vehicle_details?.registration_plate || portalUser.driver_details?.license_number || 'REGISTERED'}</span>
                        </div>
                        <div>
                          <span className="text-white/40 block text-[10px]">VEHICLE TIER</span>
                          <span className="text-white uppercase">{portalUser.vehicle_details?.tier || 'safari_4x4'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 text-xs font-mono">
                        <div>
                          <span className="text-white/40 block text-[10px]">UWA ACCREDITATION</span>
                          <span className="text-amber-400 font-bold">{portalUser.guide_details?.license_number || 'UWA CERTIFIED'}</span>
                        </div>
                        <div>
                          <span className="text-white/40 block text-[10px]">DAILY EXPEDITION RATE</span>
                          <span className="text-white font-bold">UGX 150,000 / day</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Performance & Earnings */}
                  <div className="p-6 rounded-3xl bg-[#090a0d] border border-white/10 space-y-4">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                      <Activity className="w-4 h-4 text-amber-400" />
                      <h3 className="font-bold text-white text-xs uppercase tracking-wider">Dispatch Performance</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="text-white/40 block text-[10px]">TODAY TRIPS</span>
                        <span className="text-xl font-bold text-white">0</span>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="text-white/40 block text-[10px]">RATING</span>
                        <span className="text-xl font-bold text-amber-400">5.0 ★</span>
                      </div>
                      <div className="col-span-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="text-white/40 block text-[10px]">WALLET BALANCE</span>
                        <span className="text-lg font-bold text-white">UGX 0</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Live GPS Telemetry Transmission */}
                  <div className="p-6 rounded-3xl bg-[#090a0d] border border-amber-500/20 space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-amber-400" />
                        <h3 className="font-bold text-white text-xs uppercase tracking-wider">Live GPS Telemetry</h3>
                      </div>
                      <span className="text-[10px] font-mono text-amber-400 animate-pulse">ACTIVE FEED</span>
                    </div>

                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-white/40">LATITUDE</span>
                        <span className="text-white font-bold">{currentLat}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">LONGITUDE</span>
                        <span className="text-white font-bold">{currentLng}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">HEADING</span>
                        <span className="text-white">{heading}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">LAST SYNC</span>
                        <span className="text-amber-400">{lastLocationPing || 'Initial location set'}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleTransmitGps}
                      disabled={transmittingGps}
                      className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10"
                    >
                      <Navigation className="w-3.5 h-3.5 text-black" />
                      {transmittingGps ? 'Transmitting GPS...' : 'Transmit Current Location'}
                    </button>

                    {gpsFeedback && (
                      <p className="text-[11px] font-mono leading-relaxed text-amber-400">
                        {gpsFeedback.text}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: REQUIREMENTS & FAQS */}
        {/* ================================================================= */}
        {activeTab === 'requirements' && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-white">Partner Eligibility & Standards</h2>
              <p className="text-xs text-white/60">
                To uphold tourist safety, all Mumwe Safaris drivers and tour guides are vetted against national standards.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Driver Requirements */}
              <div className="bg-[#0a0a0c] border border-white/10 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                  <Car className="w-6 h-6 text-amber-400" />
                  <h3 className="font-bold text-white text-base">Chauffeur & Driver Standards</h3>
                </div>
                <ul className="text-xs text-white/70 space-y-2.5">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>Valid Uganda Driving Permit (Class B, CM, DL, or DM) with clean record.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>Minimum of 2 years verifiable commercial or safari driving experience.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>National Identification Card (NIN) or valid Passport.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>Vehicle must be roadworthy with working AC, seatbelts, comprehensive insurance, and valid inspection.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>PSV Badge or Defensive Driving Certificate is an added advantage.</span>
                  </li>
                </ul>
              </div>

              {/* Guide Requirements */}
              <div className="bg-[#0a0a0c] border border-white/10 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                  <Compass className="w-6 h-6 text-amber-400" />
                  <h3 className="font-bold text-white text-base">Licensed Tour Guide Standards</h3>
                </div>
                <ul className="text-xs text-white/70 space-y-2.5">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>Accredited by Uganda Wildlife Authority (UWA) or Uganda Tourism Board (UTB).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>Demonstrated fluency in English. Additional languages (French, German, Spanish) receive priority tourist bookings.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>Deep expertise in Ugandan flora, fauna, gorilla tracking etiquette, and cultural history.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>First Aid certification and emergency field response training.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>Commitment to environmental conservation and anti-poaching protocols.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="text-center pt-4">
              <button
                onClick={() => { setActiveTab('apply'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider"
              >
                Start Your Partner Application
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-16 py-8 text-center text-xs text-white/40">
        <p>© 2026 Mumwe Safaris Uganda Ltd. All rights reserved.</p>
        <p className="mt-1 font-mono text-[10px]">
          Recruitment Inquiries: <a href="mailto:careers@mumwesafarisuganda.com" className="text-amber-400 hover:underline">careers@mumwesafarisuganda.com</a> | Kampala, Uganda
        </p>
      </footer>
    </div>
  );
}
