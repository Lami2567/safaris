'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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
  Lock
} from 'lucide-react';
import { api } from '@/lib/api';

type ApplicationTrack = 'driver' | 'tour_guide';

export default function CareersPage() {
  const [activeTab, setActiveTab] = useState<'apply' | 'status' | 'requirements'>('apply');
  const [track, setTrack] = useState<ApplicationTrack>('driver');
  
  // Form State
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

    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds 10MB limit. Please upload a smaller scan or photo.');
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

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-amber-500 selection:text-black">
      {/* Top Header */}
      <header className="border-b border-white/10 bg-black/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400 tracking-wider">
              M
            </div>
            <div>
              <span className="font-bold tracking-wider text-sm block">MUMWE SAFARIS UGANDA</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400/80 block">Careers & Partner Recruitment</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setActiveTab('apply'); setSubmissionSuccess(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'apply' 
                  ? 'bg-amber-500 text-black' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              Apply Online
            </button>
            <button
              onClick={() => setActiveTab('status')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'status' 
                  ? 'bg-amber-500 text-black' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              Check Status
            </button>
            <button
              onClick={() => setActiveTab('requirements')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'requirements' 
                  ? 'bg-amber-500 text-black' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              Requirements
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* TAB 1: APPLY ONLINE */}
        {activeTab === 'apply' && (
          <div>
            {submissionSuccess ? (
              <div className="max-w-2xl mx-auto text-center py-12 px-6 rounded-3xl bg-[#0a0a0c] border border-amber-500/30 shadow-2xl space-y-6">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">Application Successfully Submitted</h2>
                  <p className="text-xs text-white/60 font-mono mt-1">
                    Application Reference: <span className="text-amber-400 font-bold">{submissionSuccess.applicationId}</span>
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-left text-xs space-y-3 font-mono">
                  <div className="flex justify-between border-b border-white/10 pb-2">
                    <span className="text-white/50">Applicant Name:</span>
                    <span className="text-white font-bold">{fullName}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 pb-2">
                    <span className="text-white/50">Category:</span>
                    <span className="text-amber-400 font-bold uppercase">{track === 'driver' ? 'Safari Chauffeur / Driver' : 'Licensed Tour Guide'}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 pb-2">
                    <span className="text-white/50">Vetting Status:</span>
                    <span className="text-amber-300 font-bold">PENDING_APPROVAL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Review Period:</span>
                    <span className="text-white/80">24 – 48 Hours</span>
                  </div>
                </div>

                <div className="text-xs text-white/60 text-left bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <p className="font-semibold text-amber-300 mb-1">What Happens Next?</p>
                  <ol className="list-decimal list-inside space-y-1 text-white/70">
                    <li>Mumwe Safaris Fleet Management will verify your driving license / UWA accreditation and NIN.</li>
                    <li>Once approved by the administrator, your official operator credentials will be activated automatically.</li>
                    <li>You can then download the Mumwe Safaris Driver & Guide App and log in with your verified phone number.</li>
                  </ol>
                </div>

                <div className="flex items-center justify-center gap-3 pt-4">
                  <button
                    onClick={() => {
                      setSearchQuery(submissionSuccess.applicationId);
                      setActiveTab('status');
                    }}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 transition-colors"
                  >
                    Track Status Now
                  </button>
                  <button
                    onClick={() => {
                      setSubmissionSuccess(null);
                      setFullName('');
                      setEmail('');
                      setPhone('');
                      setVehiclePlate('');
                    }}
                    className="px-5 py-2.5 rounded-xl border border-white/20 text-white/80 text-xs hover:bg-white/5 transition-colors"
                  >
                    Submit Another Application
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Hero Banner */}
                <div className="text-center max-w-3xl mx-auto mb-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono mb-4">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Official Uganda Tourism & Mobility Recruitment
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                    Drive, Guide & Earn with Mumwe Safaris
                  </h1>
                  <p className="mt-3 text-sm text-white/60 leading-relaxed">
                    Join East Africa's leading safari and executive chauffeur network. Transport international tourists, explore national parks, and earn competitive fares paid directly to your mobile money or bank account.
                  </p>

                  {/* Track Selection Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                    <button
                      type="button"
                      onClick={() => setTrack('driver')}
                      className={`p-5 rounded-2xl border text-left transition-all ${
                        track === 'driver'
                          ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/10'
                          : 'bg-[#0f0f12] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${track === 'driver' ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/60'}`}>
                          <Car className="w-5 h-5" />
                        </div>
                        {track === 'driver' && <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500 text-black font-bold">SELECTED</span>}
                      </div>
                      <h3 className="font-bold text-base text-white">Chauffeur & Safari Driver</h3>
                      <p className="text-xs text-white/50 mt-1">
                        Drive Safari 4x4 Land Cruisers, Vans, Airport Transfers, and City Executive rides with guaranteed dispatch.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTrack('tour_guide')}
                      className={`p-5 rounded-2xl border text-left transition-all ${
                        track === 'tour_guide'
                          ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/10'
                          : 'bg-[#0f0f12] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${track === 'tour_guide' ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/60'}`}>
                          <Compass className="w-5 h-5" />
                        </div>
                        {track === 'tour_guide' && <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500 text-black font-bold">SELECTED</span>}
                      </div>
                      <h3 className="font-bold text-base text-white">Licensed Tour Guide</h3>
                      <p className="text-xs text-white/50 mt-1">
                        Lead international expeditions, gorilla tracking, wildlife game drives, birding, and cultural tours across Uganda.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Form Container */}
                <div className="max-w-3xl mx-auto bg-[#0a0a0c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
                  {errorMessage && (
                    <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmitApplication} className="space-y-8">
                    {/* Section 1: Personal Details */}
                    <div>
                      <h3 className="text-sm font-bold tracking-wider uppercase text-amber-400 font-mono flex items-center gap-2 mb-4">
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px]">1</span>
                        Personal & Contact Identification
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-white/60 font-mono mb-1">Full Legal Name (as on NIN) *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Ronald Mukwaya"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-white/60 font-mono mb-1">Mobile Phone (MTN/Airtel MoMo) *</label>
                          <input
                            type="tel"
                            required
                            placeholder="e.g. +256 772 123 456"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-white/60 font-mono mb-1">Email Address *</label>
                          <input
                            type="email"
                            required
                            placeholder="e.g. ronald.mukwaya@gmail.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-white/60 font-mono mb-1">National ID Number (NIN) / Passport *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. CM92038102XXXX"
                            value={nationalId}
                            onChange={(e) => setNationalId(e.target.value)}
                            className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400 transition-colors"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs text-white/60 font-mono mb-1">Primary Base / Operating City</label>
                          <select
                            value={operatingCity}
                            onChange={(e) => setOperatingCity(e.target.value)}
                            className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 transition-colors"
                          >
                            <option value="Kampala">Kampala & Central Metropolitan</option>
                            <option value="Entebbe">Entebbe (Airport & Tourism Corridor)</option>
                            <option value="Jinja">Jinja & Eastern Region</option>
                            <option value="Mbarara">Mbarara & Western Parks Hub</option>
                            <option value="Fort Portal">Fort Portal & Rwenzori Region</option>
                            <option value="Kasese">Kasese & Queen Elizabeth NP</option>
                            <option value="Gulu">Gulu & Northern Circuit</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Professional Qualifications */}
                    <div className="pt-6 border-t border-white/10">
                      <h3 className="text-sm font-bold tracking-wider uppercase text-amber-400 font-mono flex items-center gap-2 mb-4">
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px]">2</span>
                        {track === 'driver' ? 'Driver Credentials & Vehicle Specs' : 'Guiding Accreditation & Specialties'}
                      </h3>

                      {track === 'driver' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs text-white/60 font-mono mb-1">Driving Permit Number *</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. UG-DRV-849201"
                              value={licenseNumber}
                              onChange={(e) => setLicenseNumber(e.target.value)}
                              className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-white/60 font-mono mb-1">Permit Class</label>
                            <select
                              value={licenseClass}
                              onChange={(e) => setLicenseClass(e.target.value)}
                              className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                            >
                              <option value="Class B">Class B (Saloon & Light Passenger)</option>
                              <option value="Class CM">Class CM (Commercial Medium / Vans)</option>
                              <option value="Class DL">Class DL (Large Passenger / Coaster)</option>
                              <option value="Class DM">Class DM (Heavy Commercial Safari)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs text-white/60 font-mono mb-1">Years of Commercial Driving Experience</label>
                            <select
                              value={experienceYears}
                              onChange={(e) => setExperienceYears(e.target.value)}
                              className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                            >
                              <option value="1">1 – 2 Years</option>
                              <option value="3">3 – 5 Years</option>
                              <option value="6">6 – 10 Years</option>
                              <option value="11">10+ Years</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs text-white/60 font-mono mb-1">Vehicle Tier</label>
                            <select
                              value={vehicleTier}
                              onChange={(e) => setVehicleTier(e.target.value)}
                              className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                            >
                              <option value="safari_4x4">Safari 4x4 Land Cruiser (Pop-up Roof)</option>
                              <option value="van">Safari Passenger Van (Super Custom / Drone)</option>
                              <option value="comfort">Comfort Sedan (Toyota Premio / Fielder)</option>
                              <option value="go">Standard City Go (Compact)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs text-white/60 font-mono mb-1">Vehicle Make & Model</label>
                            <input
                              type="text"
                              placeholder="e.g. Toyota Land Cruiser V8"
                              value={`${vehicleMake} ${vehicleModel}`}
                              onChange={(e) => {
                                const parts = e.target.value.split(' ');
                                setVehicleMake(parts[0] || 'Toyota');
                                setVehicleModel(parts.slice(1).join(' ') || 'Car');
                              }}
                              className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-white/60 font-mono mb-1">Registration Number Plate *</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. UBF 482X"
                              value={vehiclePlate}
                              onChange={(e) => setVehiclePlate(e.target.value)}
                              className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400 uppercase font-mono font-bold"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs text-white/60 font-mono mb-1">UWA / UTB Guide Accreditation Number *</label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. UWA-GUIDE-2026-904"
                                value={uwaNumber}
                                onChange={(e) => setUwaNumber(e.target.value)}
                                className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400"
                              />
                            </div>

                            <div>
                              <label className="block text-xs text-white/60 font-mono mb-1">Years of Guiding Experience</label>
                              <select
                                value={experienceYears}
                                onChange={(e) => setExperienceYears(e.target.value)}
                                className="w-full bg-black border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                              >
                                <option value="2">2 – 4 Years</option>
                                <option value="5">5 – 8 Years</option>
                                <option value="9">8+ Years</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs text-white/60 font-mono mb-2">Spoken Languages Proficiency</label>
                            <div className="flex flex-wrap gap-2">
                              {availableLanguages.map(lang => (
                                <button
                                  type="button"
                                  key={lang}
                                  onClick={() => handleLanguageToggle(lang)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                                    selectedLanguages.includes(lang)
                                      ? 'bg-amber-500 text-black font-bold'
                                      : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'
                                  }`}
                                >
                                  {lang}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs text-white/60 font-mono mb-2">Guiding Specialties & Expedition Skills</label>
                            <div className="flex flex-wrap gap-2">
                              {availableSpecialties.map(spec => (
                                <button
                                  type="button"
                                  key={spec}
                                  onClick={() => handleSpecialtyToggle(spec)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                                    selectedSpecialties.includes(spec)
                                      ? 'bg-emerald-500 text-black font-bold'
                                      : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'
                                  }`}
                                >
                                  {spec}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Section 3: Required Document Uploads */}
                    <div className="pt-6 border-t border-white/10">
                      <h3 className="text-sm font-bold tracking-wider uppercase text-amber-400 font-mono flex items-center gap-2 mb-2">
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px]">3</span>
                        Required Document Uploads (PDF or Scans)
                      </h3>
                      <p className="text-xs text-white/50 mb-4">
                        Upload clear photos or PDF scans of your credentials. File size must be under 10MB per document.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Driving Permit / Accreditation */}
                        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-white">
                              {track === 'driver' ? 'Driving Permit (Front & Back)' : 'UWA / UTB Guide Certificate'}
                            </span>
                            {documents.license ? (
                              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                                <CheckCircle2 className="w-3 h-3" /> Uploaded
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-400 font-mono">Required</span>
                            )}
                          </div>
                          <label className="cursor-pointer block text-center py-4 border border-dashed border-white/20 rounded-xl hover:border-amber-400 transition-colors">
                            <Upload className="w-5 h-5 mx-auto text-white/40 mb-1" />
                            <span className="text-[11px] text-white/60">
                              {uploadingDoc === 'license' ? 'Processing...' : 'Click to select scan / PDF'}
                            </span>
                            <input 
                              type="file" 
                              accept="image/*,application/pdf"
                              onChange={(e) => handleFileUpload('license', e)} 
                              className="hidden" 
                            />
                          </label>
                        </div>

                        {/* National ID */}
                        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-white">National ID (NIN) / Passport</span>
                            {documents.national_id ? (
                              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                                <CheckCircle2 className="w-3 h-3" /> Uploaded
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-400 font-mono">Required</span>
                            )}
                          </div>
                          <label className="cursor-pointer block text-center py-4 border border-dashed border-white/20 rounded-xl hover:border-amber-400 transition-colors">
                            <Upload className="w-5 h-5 mx-auto text-white/40 mb-1" />
                            <span className="text-[11px] text-white/60">
                              {uploadingDoc === 'national_id' ? 'Processing...' : 'Click to select scan / PDF'}
                            </span>
                            <input 
                              type="file" 
                              accept="image/*,application/pdf"
                              onChange={(e) => handleFileUpload('national_id', e)} 
                              className="hidden" 
                            />
                          </label>
                        </div>

                        {/* PSV / Police Clearance */}
                        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-white">
                              {track === 'driver' ? 'PSV Badge / Defensive Driving' : 'Police Certificate of Good Conduct'}
                            </span>
                            {documents.psv_or_conduct ? (
                              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                                <CheckCircle2 className="w-3 h-3" /> Uploaded
                              </span>
                            ) : (
                              <span className="text-[10px] text-white/40 font-mono">Recommended</span>
                            )}
                          </div>
                          <label className="cursor-pointer block text-center py-4 border border-dashed border-white/20 rounded-xl hover:border-amber-400 transition-colors">
                            <Upload className="w-5 h-5 mx-auto text-white/40 mb-1" />
                            <span className="text-[11px] text-white/60">
                              {uploadingDoc === 'psv_or_conduct' ? 'Processing...' : 'Click to select scan / PDF'}
                            </span>
                            <input 
                              type="file" 
                              accept="image/*,application/pdf"
                              onChange={(e) => handleFileUpload('psv_or_conduct', e)} 
                              className="hidden" 
                            />
                          </label>
                        </div>

                        {/* Vehicle Logbook / Portrait */}
                        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-white">
                              {track === 'driver' ? 'Vehicle Logbook & Insurance' : 'Passport Portrait Photograph'}
                            </span>
                            {documents.vehicle_or_photo ? (
                              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                                <CheckCircle2 className="w-3 h-3" /> Uploaded
                              </span>
                            ) : (
                              <span className="text-[10px] text-white/40 font-mono">Required</span>
                            )}
                          </div>
                          <label className="cursor-pointer block text-center py-4 border border-dashed border-white/20 rounded-xl hover:border-amber-400 transition-colors">
                            <Upload className="w-5 h-5 mx-auto text-white/40 mb-1" />
                            <span className="text-[11px] text-white/60">
                              {uploadingDoc === 'vehicle_or_photo' ? 'Processing...' : 'Click to select photo / PDF'}
                            </span>
                            <input 
                              type="file" 
                              accept="image/*,application/pdf"
                              onChange={(e) => handleFileUpload('vehicle_or_photo', e)} 
                              className="hidden" 
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Section 4: Code of Conduct & Terms */}
                    <div className="pt-6 border-t border-white/10 space-y-4">
                      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 flex items-start gap-3">
                        <input
                          type="checkbox"
                          id="terms"
                          checked={agreedToTerms}
                          onChange={(e) => setAgreedToTerms(e.target.checked)}
                          className="mt-1 w-4 h-4 rounded border-white/30 text-amber-500 focus:ring-0 bg-black cursor-pointer"
                        />
                        <label htmlFor="terms" className="text-xs text-white/70 leading-relaxed cursor-pointer">
                          I declare that all information and documents submitted above are genuine and accurate. I agree to abide by the <strong className="text-white">Mumwe Safaris Tourist Safety Code of Conduct</strong>, Uganda Wildlife Authority park regulations, and road safety laws. I understand that falsification will result in immediate disqualification and reporting to relevant licensing authorities.
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm tracking-wider uppercase transition-all shadow-xl shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <Clock className="w-4 h-4 animate-spin" />
                            Encrypting & Transmitting Application...
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            Submit Official Application
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CHECK STATUS */}
        {activeTab === 'status' && (
          <div className="max-w-xl mx-auto py-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white">Track Application Status</h2>
              <p className="text-xs text-white/60 mt-1">
                Enter your Application Reference Number, email address, or registered phone number.
              </p>
            </div>

            <form onSubmit={handleStatusSearch} className="flex gap-2 mb-8">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-white/40 absolute left-4 top-3.5" />
                <input
                  type="text"
                  required
                  placeholder="e.g. app_a1b2c3d4 or ronald.mukwaya@gmail.com"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0a0a0c] border border-white/20 rounded-xl pl-11 pr-4 py-3 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-colors disabled:opacity-50"
              >
                {isSearching ? 'Searching...' : 'Check'}
              </button>
            </form>

            {statusError && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{statusError}</span>
              </div>
            )}

            {statusResult && (
              <div className="bg-[#0a0a0c] border border-white/10 rounded-2xl p-6 space-y-4 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <span className="text-[10px] text-white/40 uppercase block">Applicant Reference</span>
                    <span className="text-amber-400 font-bold">{statusResult.application_id}</span>
                  </div>
                  <div>
                    {statusResult.status === 'PENDING_APPROVAL' && (
                      <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                        PENDING APPROVAL
                      </span>
                    )}
                    {statusResult.status === 'APPROVED' && (
                      <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                        APPROVED & ACTIVE
                      </span>
                    )}
                    {statusResult.status === 'REJECTED' && (
                      <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold">
                        REJECTED
                      </span>
                    )}
                    {statusResult.status === 'SUSPENDED' && (
                      <span className="px-3 py-1 rounded-full bg-white/10 text-white/50 border border-white/20 text-[10px] font-bold">
                        SUSPENDED
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-white/80">
                  <div className="flex justify-between">
                    <span className="text-white/40">Full Legal Name:</span>
                    <span>{statusResult.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Track:</span>
                    <span className="uppercase">{statusResult.applicant_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Submission Date:</span>
                    <span>{statusResult.created_at ? new Date(statusResult.created_at).toLocaleDateString() : 'N/A'}</span>
                  </div>
                </div>

                {statusResult.status === 'PENDING_APPROVAL' && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
                    ⏳ <strong>Under Management Review:</strong> Your credentials have been received and are undergoing verification by the Mumwe Safaris vetting team. You will receive an SMS and email notification once approved.
                  </div>
                )}

                {statusResult.status === 'APPROVED' && (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] leading-relaxed">
                    🎉 <strong>Congratulations!</strong> Your application has been approved. Your operational account is active. Open the Mumwe Safaris mobile application and log in to begin taking dispatches.
                  </div>
                )}

                {statusResult.status === 'REJECTED' && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] leading-relaxed">
                    ❌ <strong>Application Notice:</strong> {statusResult.rejection_reason || 'Application was not approved based on current compliance guidelines.'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: REQUIREMENTS */}
        {activeTab === 'requirements' && (
          <div className="max-w-4xl mx-auto py-8 space-y-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white">Partner Eligibility & Standards</h2>
              <p className="text-xs text-white/60 mt-1">
                Mumwe Safaris maintains high-caliber safety and service standards for our international tourists.
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
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Valid Uganda Driving Permit (Class B, CM, DL, or DM) with clean record.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Minimum of 2 years verifiable commercial or safari driving experience.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>National Identification Card (NIN) or valid Passport.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Vehicle must be roadworthy with working AC, seatbelts, comprehensive insurance, and valid inspection.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
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
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Accredited by Uganda Wildlife Authority (UWA) or Uganda Tourism Board (UTB).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Demonstrated fluency in English. Additional languages (French, German, Spanish) receive priority tourist bookings.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Deep expertise in Ugandan flora, fauna, gorilla tracking etiquette, and cultural history.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>First Aid certification and emergency field response training.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
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
