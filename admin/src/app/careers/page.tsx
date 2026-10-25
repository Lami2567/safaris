'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useTheme } from '@/components/ThemeProvider';

type ApplicationTrack = 'driver' | 'tour_guide';
type PortalStep = 'login' | 'setup_password' | 'dashboard';

export default function CareersPage() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

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
  const [loginMode, setLoginMode] = useState<'otp' | 'password'>('otp');
  const [portalEmail, setPortalEmail] = useState('');
  const [portalOtp, setPortalOtp] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
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
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [statusUpdating, setStatusUpdating] = useState<boolean>(false);
  const [streamConnected, setStreamConnected] = useState<boolean>(false);

  // Real Backend Dashboard Data (Driver & Tour Guide)
  const [dashboardLoading, setDashboardLoading] = useState<boolean>(false);
  const [driverDashboard, setDriverDashboard] = useState<any | null>(null);
  const [guideDashboard, setGuideDashboard] = useState<any | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [activeTrip, setActiveTrip] = useState<any | null>(null);
  const [completedTrips, setCompletedTrips] = useState<any[]>([]);
  const [guideBookings, setGuideBookings] = useState<any[]>([]);
  const [partnerNotifications, setPartnerNotifications] = useState<any[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [operationalFeedback, setOperationalFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Location Telemetry State
  const [currentLat, setCurrentLat] = useState<number>(0.3136);
  const [currentLng, setCurrentLng] = useState<number>(32.5811);
  const [heading, setHeading] = useState<number>(90);
  const [speed, setSpeed] = useState<number>(0);
  const [lastLocationPing, setLastLocationPing] = useState<string | null>(null);
  const [transmittingGps, setTransmittingGps] = useState<boolean>(false);
  const [gpsFeedback, setGpsFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadPartnerDashboard = async (token: string, role?: string) => {
    if (!token) return;
    setDashboardLoading(true);
    try {
      const effectiveRole = role || portalUser?.role || 'driver';
      if (effectiveRole === 'tour_guide') {
        const data = await api.getGuideDashboard(token);
        setGuideDashboard(data);
        if (data?.guide) {
          setIsOnline(Boolean(data.guide.isAvailable));
          setIsAvailable(Boolean(data.guide.isAvailable));
          setPortalUser((prev: any) => ({
            ...prev,
            full_name: data.guide.fullName || prev?.full_name,
            email: data.guide.email || prev?.email,
            phone: data.guide.phone || prev?.phone,
            role: 'tour_guide',
            is_approved: data.guide.isApproved,
            approval_status: data.guide.approvalStatus,
            guide_details: data.guide,
          }));
        }
        setGuideBookings(data?.assignedBookings || []);
        setPartnerNotifications(data?.notifications || []);
      } else {
        const data = await api.getDriverDashboard(token);
        setDriverDashboard(data);
        setIsOnline(Boolean(data?.isOnline));
        setIsAvailable(Boolean(data?.isAvailable));
        if (data?.currentLat != null && data?.currentLng != null) {
          setCurrentLat(Number(data.currentLat));
          setCurrentLng(Number(data.currentLng));
        }
        setActiveTrip(data?.activeTrip || null);
        setIncomingRequests(data?.incomingRequests || []);
        setCompletedTrips(data?.completedTrips || []);
        if (data?.driverId) {
          const notifs = await api.getPartnerNotifications(data.driverId, token).catch(() => []);
          setPartnerNotifications(Array.isArray(notifs) ? notifs : []);
        }
      }
    } catch (err: any) {
      console.warn('[Partner Dashboard] Failed to load dashboard:', err?.message);
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem('safaris_partner_token');
      const savedUser = localStorage.getItem('safaris_partner_user');
      if (savedToken && savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          setPortalUser(parsed);
          setPortalAuthToken(savedToken);
          setIsOnline(parsed.driver_details?.is_online || parsed.guide_details?.isAvailable || false);
          if (parsed.driver_details?.current_lat) {
            setCurrentLat(parsed.driver_details.current_lat);
            setCurrentLng(parsed.driver_details.current_lng);
          }
          setPortalStep('dashboard');
          loadPartnerDashboard(savedToken, parsed.role);
        } catch (_) {}
      }
    }
  }, []);

  // Real-time SSE connection for authenticated Driver or Tour Guide
  useEffect(() => {
    if (portalStep !== 'dashboard' || !portalAuthToken) return;

    let es: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const connectPartnerStream = () => {
      try {
        const streamUrl = api.getPartnerStreamUrl(portalAuthToken);
        es = new EventSource(streamUrl);

        es.onopen = () => {
          setStreamConnected(true);
        };

        es.addEventListener('connected', () => {
          setStreamConnected(true);
        });

        es.addEventListener('trip:incoming_request', (e: MessageEvent) => {
          try {
            const req = JSON.parse(e.data);
            setIncomingRequests((prev) => {
              const id = req.tripId || req.id;
              if (prev.some((r) => (r.tripId || r.id) === id)) return prev;
              return [{ ...req, id }, ...prev];
            });
          } catch {}
        });

        es.addEventListener('trip:request_closed', (e: MessageEvent) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload?.tripId) {
              setIncomingRequests((prev) => prev.filter((r) => (r.tripId || r.id) !== payload.tripId));
            }
          } catch {}
        });

        es.addEventListener('trip:driver_assigned', () => {
          loadPartnerDashboard(portalAuthToken, portalUser?.role);
        });

        es.addEventListener('trip:status_changed', () => {
          loadPartnerDashboard(portalAuthToken, portalUser?.role);
        });

        es.addEventListener('tour:booking_assigned', () => {
          loadPartnerDashboard(portalAuthToken, 'tour_guide');
        });

        es.addEventListener('tour:booking_updated', () => {
          loadPartnerDashboard(portalAuthToken, 'tour_guide');
        });

        es.addEventListener('account:approval_updated', () => {
          loadPartnerDashboard(portalAuthToken, portalUser?.role);
        });

        es.addEventListener('notification:new', (e: MessageEvent) => {
          try {
            const notif = JSON.parse(e.data);
            setPartnerNotifications((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
          } catch {}
        });

        es.onerror = () => {
          setStreamConnected(false);
          if (es) {
            es.close();
            es = null;
          }
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connectPartnerStream, 4000);
        };
      } catch {
        setStreamConnected(false);
      }
    };

    connectPartnerStream();

    return () => {
      if (es) es.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [portalStep, portalAuthToken, portalUser?.role]);

  // Continuous live GPS watch when an approved driver is online
  useEffect(() => {
    if (portalStep !== 'dashboard' || !portalAuthToken || portalUser?.role === 'tour_guide' || !isOnline) {
      return;
    }

    let watchId: number | null = null;
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = parseFloat(pos.coords.latitude.toFixed(6));
          const lng = parseFloat(pos.coords.longitude.toFixed(6));
          const hdg = pos.coords.heading || heading;
          const spd = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;
          setCurrentLat(lat);
          setCurrentLng(lng);
          setHeading(hdg);
          setSpeed(spd);
          api.updateDriverLocation(lat, lng, hdg, portalAuthToken).then(() => {
            setLastLocationPing(new Date().toLocaleTimeString());
          }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    }

    return () => {
      if (watchId != null && typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [portalStep, portalAuthToken, portalUser?.role, isOnline]);

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

  const handleFileUpload = async (docKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit. Please upload a smaller scan or photo.');
      return;
    }

    setUploadingDoc(docKey);
    try {
      // Attach to the recruitment submission; the server validates and stores it privately.
      const attachment = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read attachment.'));
        reader.readAsDataURL(file);
      });
      setDocuments(prev => ({ ...prev, [docKey]: attachment }));
    } catch (err: any) {
      alert(err.message || 'Failed to upload document to Cloudflare R2 storage. Please try again.');
    } finally {
      setUploadingDoc(null);
    }
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
        operating_city: operatingCity,
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

  const handleOtpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPortalError(null);

    if (loginMode === 'password') {
      if (!portalEmail.trim() || !portalPassword.trim()) {
        setPortalError('Please enter both your email/phone and password.');
        return;
      }
      setPortalLoading(true);
      try {
        const res = await api.loginPartner(portalEmail.trim(), portalPassword);
        if (res && res.accessToken) {
          setPortalAuthToken(res.accessToken);
          setPortalUser(res.user);
          if (typeof window !== 'undefined') {
            localStorage.setItem('safaris_partner_token', res.accessToken);
            localStorage.setItem('safaris_partner_user', JSON.stringify(res.user));
          }
          setPortalStep('dashboard');
          await loadPartnerDashboard(res.accessToken, res.user?.role);
        }
      } catch (err: any) {
        setPortalError(err.message || 'Invalid credentials. Please verify your email and password.');
      } finally {
        setPortalLoading(false);
      }
      return;
    }

    if (!portalEmail.trim() || !portalOtp.trim()) {
      setPortalError('Please enter both your email address and 6-digit OTP code.');
      return;
    }

    setPortalLoading(true);
    try {
      const res = await api.loginWithOtp(portalEmail.trim().toLowerCase(), portalOtp.trim());
      if (res && res.requiresPasswordSetup && res.setupToken) {
        setSetupToken(res.setupToken);
        setPortalUser(res.user);
        setPortalStep('setup_password');
      } else if (res && res.accessToken) {
        setPortalAuthToken(res.accessToken);
        setPortalUser(res.user);
        if (typeof window !== 'undefined') {
          localStorage.setItem('safaris_partner_token', res.accessToken);
          localStorage.setItem('safaris_partner_user', JSON.stringify(res.user));
        }
        setPortalStep('dashboard');
        await loadPartnerDashboard(res.accessToken, res.user?.role);
      }
    } catch (err: any) {
      setPortalError(err.message || 'Invalid OTP or email. Please check your approval email.');
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(null);

    if (newPassword.length < 6) {
      setSetupError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setSetupError('Passwords do not match. Please re-enter.');
      return;
    }

    setSetupLoading(true);
    try {
      const res = await api.setupPassword(portalEmail.trim().toLowerCase(), setupToken, newPassword);
      if (res && res.accessToken) {
        setPortalAuthToken(res.accessToken);
        setPortalUser(res.user);
        setIsOnline(res.user?.driver_details?.is_online || false);
        if (typeof window !== 'undefined') {
          localStorage.setItem('safaris_partner_token', res.accessToken);
          localStorage.setItem('safaris_partner_user', JSON.stringify(res.user));
        }
        setPortalStep('dashboard');
        await loadPartnerDashboard(res.accessToken, res.user?.role);
      }
    } catch (err: any) {
      setSetupError(err.message || 'Could not set password. Please try again.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleToggleOnline = async () => {
    if (!portalAuthToken) return;
    setStatusUpdating(true);
    setOperationalFeedback(null);
    try {
      const nextState = !isOnline;
      if (portalUser?.role === 'tour_guide') {
        const res = await api.setGuideAvailability(nextState, portalAuthToken);
        setIsOnline(Boolean(res?.isAvailable ?? nextState));
        setIsAvailable(Boolean(res?.isAvailable ?? nextState));
        setOperationalFeedback({
          text: `Tour guide availability updated to ${nextState ? 'AVAILABLE' : 'UNAVAILABLE'}.`,
          type: 'success',
        });
      } else {
        const res = await api.setDriverAvailability(nextState, portalAuthToken);
        setIsOnline(Boolean(res?.isOnline ?? nextState));
        setIsAvailable(Boolean(res?.isAvailable ?? nextState));
        if (nextState) {
          await sendLocationToBackend(currentLat, currentLng, heading);
        }
        setOperationalFeedback({
          text: `Driver operational status updated to ${nextState ? 'ONLINE & AVAILABLE' : 'OFFLINE'}. Admin map synchronized.`,
          type: 'success',
        });
      }
      await loadPartnerDashboard(portalAuthToken, portalUser?.role);
    } catch (err: any) {
      setOperationalFeedback({ text: err.message || 'Failed to update availability.', type: 'error' });
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAcceptRideRequest = async (tripId: string) => {
    if (!portalAuthToken || !tripId) return;
    setActionBusyId(tripId);
    setOperationalFeedback(null);
    try {
      await api.acceptTrip(tripId, portalAuthToken);
      setOperationalFeedback({ text: 'Ride request accepted! Customer and Admin Map updated in real time.', type: 'success' });
      await loadPartnerDashboard(portalAuthToken, 'driver');
    } catch (err: any) {
      setOperationalFeedback({ text: err.message || 'Could not accept ride request.', type: 'error' });
      await loadPartnerDashboard(portalAuthToken, 'driver');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRejectRideRequest = async (tripId: string) => {
    if (!portalAuthToken || !tripId) return;
    setActionBusyId(tripId);
    setOperationalFeedback(null);
    try {
      await api.rejectTrip(tripId, portalAuthToken);
      setIncomingRequests((prev) => prev.filter((r) => (r.tripId || r.id) !== tripId));
      setOperationalFeedback({ text: 'Ride request declined.', type: 'success' });
    } catch (err: any) {
      setOperationalFeedback({ text: err.message || 'Could not decline ride request.', type: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleUpdateActiveTripStatus = async (tripId: string, nextStatus: string) => {
    if (!portalAuthToken || !tripId) return;
    setActionBusyId(tripId);
    setOperationalFeedback(null);
    try {
      await api.updateTripStatus(tripId, nextStatus, portalAuthToken);
      setOperationalFeedback({ text: `Trip status updated to ${nextStatus}.`, type: 'success' });
      await loadPartnerDashboard(portalAuthToken, 'driver');
    } catch (err: any) {
      setOperationalFeedback({ text: err.message || 'Failed to update trip status.', type: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleUpdateGuideBookingStatus = async (bookingId: string, nextStatus: string) => {
    if (!portalAuthToken || !bookingId) return;
    setActionBusyId(bookingId);
    setOperationalFeedback(null);
    try {
      await api.updatePartnerBookingStatus(bookingId, nextStatus, portalAuthToken);
      setOperationalFeedback({ text: `Safari booking status updated to ${nextStatus}. Customer notified in real time.`, type: 'success' });
      await loadPartnerDashboard(portalAuthToken, 'tour_guide');
    } catch (err: any) {
      setOperationalFeedback({ text: err.message || 'Failed to update booking status.', type: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleCashoutWallet = async () => {
    if (!portalAuthToken) return;
    const balance = driverDashboard?.walletBalanceUGX || 0;
    if (balance <= 0) {
      setOperationalFeedback({ text: 'No wallet balance available for withdrawal.', type: 'error' });
      return;
    }
    setActionBusyId('cashout');
    setOperationalFeedback(null);
    try {
      const res = await api.driverCashOut(portalAuthToken);
      setOperationalFeedback({ text: res.message || 'Withdrawal completed.', type: 'success' });
      await loadPartnerDashboard(portalAuthToken, 'driver');
    } catch (err: any) {
      setOperationalFeedback({ text: err.message || 'Cashout failed.', type: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleTransmitGps = async () => {
    setTransmittingGps(true);
    setGpsFeedback(null);

    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
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
        text: `Live GPS transmitted to Mumwe Safaris Dispatch: ${lat}, ${lng} at ${timestamp}. Admin map is now updated.`,
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
    setDriverDashboard(null);
    setGuideDashboard(null);
    setActiveTrip(null);
    setIncomingRequests([]);
    setGuideBookings([]);
    setPartnerNotifications([]);
    setPortalStep('login');
    setPortalEmail('');
    setPortalOtp('');
    setPortalPassword('');
  };

  // Theme-consistent classic styles
  const pageBg = isLight ? 'bg-[#eef2f6] text-[#0f172a]' : 'bg-[#0b0c10] text-[#f8fafc]';
  const headerBg = isLight ? 'bg-white border-[#cbd5e1]' : 'bg-[#12141a] border-[#2d323e]';
  const panelBg = isLight ? 'bg-white border-[#cbd5e1]' : 'bg-[#12141a] border-[#2d323e]';
  const sectionHeaderBg = isLight ? 'bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a]' : 'bg-[#181b22] border-[#2d323e] text-[#f8fafc]';
  const labelClass = `block text-[14px] font-bold mb-1.5 ${isLight ? 'text-[#0f172a]' : 'text-[#f1f5f9]'}`;
  const helperClass = `text-[13px] font-medium mt-1 block ${isLight ? 'text-[#475569]' : 'text-[#94a3b8]'}`;
  const inputClass = `w-full px-3.5 py-2.5 rounded-[4px] border text-[15px] font-semibold focus:outline-none ${
    isLight
      ? 'bg-white border-[#94a3b8] text-[#0f172a] focus:border-[#1d4ed8]'
      : 'bg-[#0d0f14] border-[#3f4654] text-[#f8fafc] focus:border-[#3b82f6]'
  }`;
  const primaryBtnClass = `px-6 py-3 rounded-[4px] font-bold text-[15px] transition-colors disabled:opacity-50 ${
    isLight
      ? 'bg-[#1e3a8a] hover:bg-[#172e6e] text-white border border-[#172554]'
      : 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white border border-[#1d4ed8]'
  }`;
  const secondaryBtnClass = `px-4 py-2 rounded-[4px] font-bold text-[13px] border transition-colors ${
    isLight
      ? 'bg-[#f8fafc] hover:bg-[#e2e8f0] text-[#0f172a] border-[#94a3b8]'
      : 'bg-[#181b22] hover:bg-[#232730] text-[#f1f5f9] border-[#3f4654]'
  }`;

  return (
    <div
      className={`min-h-screen ${pageBg}`}
      style={{
        fontFamily: "'Plus Jakarta Sans', 'Inter', 'Segoe UI', Arial, sans-serif",
      }}
    >
      {/* Classic Institutional Top Navigation Bar */}
      <header className={`border-b ${headerBg} sticky top-0 z-40 shadow-sm`}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-[19px] font-extrabold tracking-tight">
              MUMWE SAFARIS UGANDA
            </div>
            <div className={`text-[13px] font-semibold ${isLight ? 'text-[#334155]' : 'text-[#cbd5e1]'}`}>
              Driver &amp; Tour Guide Application Portal
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setActiveTab('apply'); setSubmissionSuccess(null); }}
              className={`px-3.5 py-2 rounded-[4px] text-[13px] font-bold border transition-colors ${
                activeTab === 'apply'
                  ? isLight
                    ? 'bg-[#1e3a8a] text-white border-[#172554]'
                    : 'bg-[#2563eb] text-white border-[#1d4ed8]'
                  : isLight
                  ? 'bg-white text-[#1e293b] border-[#cbd5e1] hover:bg-[#f1f5f9]'
                  : 'bg-[#181b22] text-[#e2e8f0] border-[#2d323e] hover:bg-[#232730]'
              }`}
            >
              Apply Online
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('status')}
              className={`px-3.5 py-2 rounded-[4px] text-[13px] font-bold border transition-colors ${
                activeTab === 'status'
                  ? isLight
                    ? 'bg-[#1e3a8a] text-white border-[#172554]'
                    : 'bg-[#2563eb] text-white border-[#1d4ed8]'
                  : isLight
                  ? 'bg-white text-[#1e293b] border-[#cbd5e1] hover:bg-[#f1f5f9]'
                  : 'bg-[#181b22] text-[#e2e8f0] border-[#2d323e] hover:bg-[#232730]'
              }`}
            >
              Application Status
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('portal')}
              className={`px-3.5 py-2 rounded-[4px] text-[13px] font-bold border transition-colors ${
                activeTab === 'portal'
                  ? isLight
                    ? 'bg-[#1e3a8a] text-white border-[#172554]'
                    : 'bg-[#2563eb] text-white border-[#1d4ed8]'
                  : isLight
                  ? 'bg-white text-[#1e293b] border-[#cbd5e1] hover:bg-[#f1f5f9]'
                  : 'bg-[#181b22] text-[#e2e8f0] border-[#2d323e] hover:bg-[#232730]'
              }`}
            >
              Partner Login
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('requirements')}
              className={`px-3.5 py-2 rounded-[4px] text-[13px] font-bold border transition-colors ${
                activeTab === 'requirements'
                  ? isLight
                    ? 'bg-[#1e3a8a] text-white border-[#172554]'
                    : 'bg-[#2563eb] text-white border-[#1d4ed8]'
                  : isLight
                  ? 'bg-white text-[#1e293b] border-[#cbd5e1] hover:bg-[#f1f5f9]'
                  : 'bg-[#181b22] text-[#e2e8f0] border-[#2d323e] hover:bg-[#232730]'
              }`}
            >
              Requirements
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className={secondaryBtnClass}
              title="Toggle Light / Dark Mode"
            >
              {isLight ? 'Dark Mode' : 'Light Mode'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* ================================================================= */}
        {/* TAB 1: APPLY ONLINE */}
        {/* ================================================================= */}
        {activeTab === 'apply' && (
          <div>
            {submissionSuccess ? (
              <div className={`max-w-2xl mx-auto rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                <div className={`px-6 py-4 border-b ${sectionHeaderBg}`}>
                  <h2 className="text-[20px] font-extrabold">Application Submitted Successfully</h2>
                </div>
                <div className="p-6 sm:p-8 space-y-6">
                  <p className="text-[15px] font-semibold">
                    Application Reference ID:{' '}
                    <span className="font-extrabold underline">{submissionSuccess.applicationId}</span>
                  </p>

                  <div className={`rounded-[4px] border p-5 space-y-3 text-[14px] ${isLight ? 'bg-[#f8fafc] border-[#cbd5e1]' : 'bg-[#181b22] border-[#2d323e]'}`}>
                    <div className="flex justify-between border-b border-current/10 pb-2">
                      <span className="font-semibold">Applicant Name:</span>
                      <span className="font-extrabold">{fullName}</span>
                    </div>
                    <div className="flex justify-between border-b border-current/10 pb-2">
                      <span className="font-semibold">Application Track:</span>
                      <span className="font-extrabold uppercase">{track === 'driver' ? 'Safari Driver / Chauffeur' : 'Licensed Tour Guide'}</span>
                    </div>
                    <div className="flex justify-between border-b border-current/10 pb-2">
                      <span className="font-semibold">Contact Email:</span>
                      <span className="font-extrabold">{email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">Review Status:</span>
                      <span className="font-extrabold">PENDING ADMIN APPROVAL</span>
                    </div>
                  </div>

                  <div className={`p-4 rounded-[4px] border text-[14px] leading-relaxed ${isLight ? 'bg-[#eff6ff] border-[#93c5fd] text-[#1e3a8a]' : 'bg-[#172554]/40 border-[#1d4ed8] text-[#dbeafe]'}`}>
                    <p className="font-extrabold mb-1">Next Steps in the Approval Process:</p>
                    <ol className="list-decimal list-inside space-y-1 font-medium">
                      <li>Our administrators will review your submitted details and attached verification documents.</li>
                      <li>Once approved, an activation email containing a 6-digit One-Time Passcode (OTP) will be sent to <strong>{email}</strong>.</li>
                      <li>Use the <strong>Partner Login</strong> tab with your email and OTP to set your password and enter your dashboard.</li>
                    </ol>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => { setActiveTab('status'); setSearchQuery(submissionSuccess.applicationId); }}
                      className={primaryBtnClass}
                    >
                      Check Application Status
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSubmissionSuccess(null); setActiveTab('apply'); }}
                      className={secondaryBtnClass}
                    >
                      Submit Another Application
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Page Title & Role Selection Banner */}
                <div className={`rounded-[4px] border ${panelBg} p-6 sm:p-8 shadow-sm`}>
                  <div className="border-b border-current/10 pb-5 mb-6">
                    <h1 className="text-[24px] sm:text-[28px] font-extrabold tracking-tight">
                      Partner &amp; Chauffeur Registration Form
                    </h1>
                    <p className={`text-[15px] font-medium mt-2 leading-relaxed ${isLight ? 'text-[#334155]' : 'text-[#cbd5e1]'}`}>
                      Complete the official form below to apply as a registered Safari Driver or Licensed Tour Guide with Mumwe Safaris Uganda. All fields marked with an asterisk (*) are mandatory.
                    </p>
                  </div>

                  <div>
                    <label className={labelClass}>Select Application Category *</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                      <label
                        onClick={() => setTrack('driver')}
                        className={`cursor-pointer p-4 rounded-[4px] border-2 flex items-start gap-3 transition-colors ${
                          track === 'driver'
                            ? isLight
                              ? 'border-[#1e3a8a] bg-[#eff6ff]'
                              : 'border-[#3b82f6] bg-[#1e3a8a]/25'
                            : isLight
                            ? 'border-[#cbd5e1] bg-[#f8fafc] hover:border-[#94a3b8]'
                            : 'border-[#2d323e] bg-[#181b22] hover:border-[#475569]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="applicant_track"
                          checked={track === 'driver'}
                          onChange={() => setTrack('driver')}
                          className="mt-1 w-4 h-4"
                        />
                        <div>
                          <div className="text-[16px] font-extrabold">Safari Driver / Chauffeur</div>
                          <div className={`text-[13px] font-medium mt-0.5 ${isLight ? 'text-[#475569]' : 'text-[#94a3b8]'}`}>
                            4x4 Safari Vehicles, Executive Transfers &amp; City Mobility
                          </div>
                        </div>
                      </label>

                      <label
                        onClick={() => setTrack('tour_guide')}
                        className={`cursor-pointer p-4 rounded-[4px] border-2 flex items-start gap-3 transition-colors ${
                          track === 'tour_guide'
                            ? isLight
                              ? 'border-[#1e3a8a] bg-[#eff6ff]'
                              : 'border-[#3b82f6] bg-[#1e3a8a]/25'
                            : isLight
                            ? 'border-[#cbd5e1] bg-[#f8fafc] hover:border-[#94a3b8]'
                            : 'border-[#2d323e] bg-[#181b22] hover:border-[#475569]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="applicant_track"
                          checked={track === 'tour_guide'}
                          onChange={() => setTrack('tour_guide')}
                          className="mt-1 w-4 h-4"
                        />
                        <div>
                          <div className="text-[16px] font-extrabold">Licensed Tour Guide</div>
                          <div className={`text-[13px] font-medium mt-0.5 ${isLight ? 'text-[#475569]' : 'text-[#94a3b8]'}`}>
                            National Park Expeditions, Gorilla Trekking &amp; Cultural Tours
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Main Application Form */}
                <form onSubmit={handleSubmitApplication} className="space-y-6">
                  {errorMessage && (
                    <div className="p-4 rounded-[4px] bg-[#fef2f2] border border-[#f87171] text-[#991b1b] text-[14px] font-bold">
                      {errorMessage}
                    </div>
                  )}

                  {/* Section 1: Personal & Contact Details */}
                  <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                    <div className={`px-6 py-3.5 border-b ${sectionHeaderBg}`}>
                      <h2 className="text-[16px] font-extrabold uppercase tracking-wide">
                        Section 1: Personal &amp; Contact Information
                      </h2>
                    </div>
                    <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className={labelClass}>Full Legal Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Denis Kiggundu"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Primary Phone Number (MTN / Airtel) *</label>
                        <input
                          type="tel"
                          required
                          placeholder="+256 700 000 000"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Email Address *</label>
                        <input
                          type="email"
                          required
                          placeholder="applicant@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={inputClass}
                        />
                        <span className={helperClass}>
                          Your approval notification and login OTP code will be sent to this email.
                        </span>
                      </div>

                      <div>
                        <label className={labelClass}>National ID Number (NIN) or Passport Number *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. CM920384758392"
                          value={nationalId}
                          onChange={(e) => setNationalId(e.target.value)}
                          className={`${inputClass} uppercase`}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Primary Operating City / Region *</label>
                        <select
                          value={operatingCity}
                          onChange={(e) => setOperatingCity(e.target.value)}
                          className={inputClass}
                        >
                          <option value="Kampala">Kampala Metropolitan</option>
                          <option value="Entebbe">Entebbe International Corridor</option>
                          <option value="Jinja">Jinja &amp; Eastern Region</option>
                          <option value="Mbarara">Mbarara &amp; Western Safari Circuit</option>
                          <option value="Fort Portal">Fort Portal / Kasese</option>
                          <option value="Gulu">Gulu &amp; Northern Circuit</option>
                        </select>
                      </div>

                      <div>
                        <label className={labelClass}>Years of Professional Experience *</label>
                        <input
                          type="number"
                          min="1"
                          max="45"
                          required
                          value={experienceYears}
                          onChange={(e) => setExperienceYears(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Role-Specific Qualifications */}
                  {track === 'driver' ? (
                    <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                      <div className={`px-6 py-3.5 border-b ${sectionHeaderBg}`}>
                        <h2 className="text-[16px] font-extrabold uppercase tracking-wide">
                          Section 2: Driving Permit &amp; Vehicle Particulars
                        </h2>
                      </div>
                      <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className={labelClass}>Uganda Driving Permit Number *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. DL-UG-984321"
                            value={licenseNumber}
                            onChange={(e) => setLicenseNumber(e.target.value)}
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>Driving Permit Class *</label>
                          <select
                            value={licenseClass}
                            onChange={(e) => setLicenseClass(e.target.value)}
                            className={inputClass}
                          >
                            <option value="Class B / CM">Class B / CM (Passenger Vehicle)</option>
                            <option value="Class DL / DM">Class DL / DM (Tour Coach &amp; Van)</option>
                            <option value="Class A">Class A (Motorcycle Courier)</option>
                          </select>
                        </div>

                        <div>
                          <label className={labelClass}>Vehicle Make *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Toyota"
                            value={vehicleMake}
                            onChange={(e) => setVehicleMake(e.target.value)}
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>Vehicle Model *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Land Cruiser Prado 4x4"
                            value={vehicleModel}
                            onChange={(e) => setVehicleModel(e.target.value)}
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>Vehicle Registration Plate Number *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. UBD 123A"
                            value={vehiclePlate}
                            onChange={(e) => setVehiclePlate(e.target.value)}
                            className={`${inputClass} uppercase`}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>Service Classification Tier *</label>
                          <select
                            value={vehicleTier}
                            onChange={(e) => setVehicleTier(e.target.value)}
                            className={inputClass}
                          >
                            <option value="safari_4x4">Safari 4x4 (Land Cruiser, Super Custom, Prado)</option>
                            <option value="go">Mumwe Go (Standard Sedan / Compact)</option>
                            <option value="comfort">Mumwe Comfort (Executive Sedan)</option>
                            <option value="xl">Mumwe XL (6-8 Seater Minivan)</option>
                            <option value="delivery">Package Courier Van</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                      <div className={`px-6 py-3.5 border-b ${sectionHeaderBg}`}>
                        <h2 className="text-[16px] font-extrabold uppercase tracking-wide">
                          Section 2: Tour Guiding Credentials &amp; Specializations
                        </h2>
                      </div>
                      <div className="p-6 sm:p-8 space-y-6">
                        <div className="max-w-md">
                          <label className={labelClass}>UWA / UTB Guide License Number *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. UWA-TG-2024-893"
                            value={uwaNumber}
                            onChange={(e) => setUwaNumber(e.target.value)}
                            className={`${inputClass} uppercase`}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>Spoken Languages (Select all that apply)</label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                            {availableLanguages.map((lang) => {
                              const active = selectedLanguages.includes(lang);
                              return (
                                <label
                                  key={lang}
                                  className={`cursor-pointer px-3.5 py-2.5 rounded-[4px] border text-[14px] font-bold flex items-center gap-2.5 ${
                                    active
                                      ? isLight
                                        ? 'bg-[#eff6ff] border-[#1e3a8a] text-[#1e3a8a]'
                                        : 'bg-[#1e3a8a]/30 border-[#3b82f6] text-white'
                                      : isLight
                                      ? 'bg-white border-[#cbd5e1] text-[#334155]'
                                      : 'bg-[#181b22] border-[#2d323e] text-[#cbd5e1]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => handleLanguageToggle(lang)}
                                    className="w-4 h-4"
                                  />
                                  <span>{lang}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <label className={labelClass}>Safari Specialties (Select all that apply)</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                            {availableSpecialties.map((spec) => {
                              const active = selectedSpecialties.includes(spec);
                              return (
                                <label
                                  key={spec}
                                  className={`cursor-pointer px-3.5 py-2.5 rounded-[4px] border text-[14px] font-bold flex items-center gap-2.5 ${
                                    active
                                      ? isLight
                                        ? 'bg-[#eff6ff] border-[#1e3a8a] text-[#1e3a8a]'
                                        : 'bg-[#1e3a8a]/30 border-[#3b82f6] text-white'
                                      : isLight
                                      ? 'bg-white border-[#cbd5e1] text-[#334155]'
                                      : 'bg-[#181b22] border-[#2d323e] text-[#cbd5e1]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => handleSpecialtyToggle(spec)}
                                    className="w-4 h-4"
                                  />
                                  <span>{spec}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Section 3: Verification Documents (Stored on Cloudflare R2) */}
                  <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                    <div className={`px-6 py-3.5 border-b flex items-center justify-between ${sectionHeaderBg}`}>
                      <h2 className="text-[16px] font-extrabold uppercase tracking-wide">
                        Section 3: Required Verification Documents
                      </h2>
                      <span className="text-[12px] font-mono font-bold opacity-80">
                        Cloudflare R2 Secure Storage
                      </span>
                    </div>
                    <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                      {[
                        {
                          key: 'license',
                          label: track === 'driver' ? '1. Uganda Driving Permit (Front & Back) *' : '1. UWA Guide License Scan *',
                          accept: 'image/*,application/pdf',
                        },
                        {
                          key: 'national_id',
                          label: '2. National ID Card (NIN) or Passport *',
                          accept: 'image/*,application/pdf',
                        },
                        {
                          key: 'logbook',
                          label: track === 'driver' ? '3. Vehicle Logbook & Insurance Certificate' : '3. First Aid / Training Certificate',
                          accept: 'image/*,application/pdf',
                        },
                        {
                          key: 'avatar',
                          label: '4. Passport Photo / Portrait *',
                          accept: 'image/*',
                        },
                      ].map((docItem) => {
                        const docUrl = documents[docItem.key];
                        const isUploading = uploadingDoc === docItem.key;
                        return (
                          <div
                            key={docItem.key}
                            className={`p-4 rounded-[4px] border ${
                              isLight ? 'bg-[#f8fafc] border-[#cbd5e1]' : 'bg-[#181b22] border-[#2d323e]'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-2 gap-2">
                              <label className="text-[14px] font-bold">{docItem.label}</label>
                              {docUrl && (
                                <a
                                  href={docUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[12px] font-extrabold text-emerald-700 underline hover:opacity-80 shrink-0"
                                >
                                  Uploaded (View)
                                </a>
                              )}
                            </div>
                            <input
                              type="file"
                              accept={docItem.accept}
                              disabled={isUploading}
                              onChange={(e) => handleFileUpload(docItem.key, e)}
                              className="block w-full text-[13px] font-semibold file:mr-3 file:py-2 file:px-3.5 file:rounded-[4px] file:border file:border-slate-400 file:text-[13px] file:font-bold file:bg-white file:text-slate-900 hover:file:bg-slate-100 cursor-pointer disabled:opacity-50"
                            />
                            {isUploading && (
                              <span className={helperClass}>Uploading document to Cloudflare R2...</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 4: Declaration & Submission */}
                  <div className={`rounded-[4px] border ${panelBg} p-6 sm:p-8 shadow-sm space-y-5`}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        className="mt-1 w-4 h-4"
                      />
                      <span className="text-[14px] font-semibold leading-relaxed">
                        I hereby declare that all information and documents submitted in this application are true and accurate. I agree to abide by the Mumwe Safaris Uganda Operational Standards, Road Safety Regulations, and Uganda Wildlife Authority Guidelines.
                      </span>
                    </label>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className={primaryBtnClass}
                      >
                        {isSubmitting ? 'Submitting Application...' : 'Submit Official Application'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: APPLICATION STATUS */}
        {/* ================================================================= */}
        {activeTab === 'status' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
              <div className={`px-6 py-4 border-b ${sectionHeaderBg}`}>
                <h2 className="text-[20px] font-extrabold">Check Application Status</h2>
              </div>
              <div className="p-6 sm:p-8 space-y-5">
                <p className="text-[15px] font-medium">
                  Enter your Application Reference ID or your registered email address to verify the status of your application.
                </p>

                <form onSubmit={handleStatusSearch} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Application ID (e.g. app_9a8b7c6d) or Email Address"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className={primaryBtnClass}
                  >
                    {isSearching ? 'Searching...' : 'Search Status'}
                  </button>
                </form>

                {statusError && (
                  <div className="p-4 rounded-[4px] bg-[#fef2f2] border border-[#f87171] text-[#991b1b] text-[14px] font-bold">
                    {statusError}
                  </div>
                )}

                {statusResult && (
                  <div className={`mt-4 rounded-[4px] border p-5 space-y-4 ${isLight ? 'bg-[#f8fafc] border-[#cbd5e1]' : 'bg-[#181b22] border-[#2d323e]'}`}>
                    <div className="flex items-center justify-between border-b border-current/10 pb-3">
                      <div>
                        <h3 className="text-[18px] font-extrabold">{statusResult.full_name}</h3>
                        <p className="text-[13px] font-semibold opacity-75">
                          {statusResult.email} • {statusResult.phone}
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-[4px] text-[13px] font-extrabold border border-current/25">
                        {statusResult.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-[14px]">
                      <div>
                        <span className="block text-[12px] font-bold uppercase opacity-60">Application ID</span>
                        <span className="font-extrabold">{statusResult.id}</span>
                      </div>
                      <div>
                        <span className="block text-[12px] font-bold uppercase opacity-60">Category</span>
                        <span className="font-extrabold uppercase">{statusResult.applicant_type}</span>
                      </div>
                      <div>
                        <span className="block text-[12px] font-bold uppercase opacity-60">Experience</span>
                        <span className="font-extrabold">{statusResult.experience_years} Years</span>
                      </div>
                      <div>
                        <span className="block text-[12px] font-bold uppercase opacity-60">Submitted On</span>
                        <span className="font-extrabold">{new Date(statusResult.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {statusResult.status === 'APPROVED' && (
                      <div className="pt-3 border-t border-current/10 space-y-3">
                        <p className="text-[14px] font-bold text-emerald-700 dark:text-emerald-400">
                          Your application has been approved. Check your email inbox for your 6-digit login OTP code.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setPortalEmail(statusResult.email);
                            setActiveTab('portal');
                          }}
                          className={primaryBtnClass}
                        >
                          Proceed to Partner Login
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: PARTNER & DRIVER PORTAL (OTP/PASSWORD LOGIN -> DASHBOARD)  */}
        {/* ================================================================= */}
        {activeTab === 'portal' && (
          <div className="max-w-5xl mx-auto">
            {/* STEP 1: OTP OR PASSWORD LOGIN */}
            {portalStep === 'login' && (
              <div className={`max-w-lg mx-auto rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                <div className={`px-6 py-4 border-b ${sectionHeaderBg}`}>
                  <h2 className="text-[19px] font-extrabold">Approved Partner &amp; Driver Login</h2>
                </div>
                <div className="p-6 sm:p-8 space-y-5">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setLoginMode('otp'); setPortalError(null); }}
                      className={`py-2.5 px-3 rounded-[4px] text-[13px] font-bold border transition-colors ${
                        loginMode === 'otp'
                          ? isLight
                            ? 'bg-[#1e3a8a] text-white border-[#172554]'
                            : 'bg-[#2563eb] text-white border-[#1d4ed8]'
                          : secondaryBtnClass
                      }`}
                    >
                      First-Time OTP Login
                    </button>
                    <button
                      type="button"
                      onClick={() => { setLoginMode('password'); setPortalError(null); }}
                      className={`py-2.5 px-3 rounded-[4px] text-[13px] font-bold border transition-colors ${
                        loginMode === 'password'
                          ? isLight
                            ? 'bg-[#1e3a8a] text-white border-[#172554]'
                            : 'bg-[#2563eb] text-white border-[#1d4ed8]'
                          : secondaryBtnClass
                      }`}
                    >
                      Password Login
                    </button>
                  </div>

                  <p className="text-[14px] font-medium leading-relaxed">
                    {loginMode === 'otp'
                      ? 'Enter your approved email address and the 6-digit One-Time Passcode (OTP) sent to your email upon administrator approval.'
                      : 'Sign in using your registered email address (or phone number) and your permanent account password.'}
                  </p>

                  {portalError && (
                    <div className="p-3.5 rounded-[4px] bg-[#fef2f2] border border-[#f87171] text-[#991b1b] text-[14px] font-bold">
                      {portalError}
                    </div>
                  )}

                  <form onSubmit={handleOtpLogin} className="space-y-5">
                    <div>
                      <label className={labelClass}>
                        {loginMode === 'otp' ? 'Registered Email Address *' : 'Email Address or Phone Number *'}
                      </label>
                      <input
                        type={loginMode === 'otp' ? 'email' : 'text'}
                        required
                        placeholder={loginMode === 'otp' ? 'driver@example.com' : 'driver@example.com or +256...'}
                        value={portalEmail}
                        onChange={(e) => setPortalEmail(e.target.value)}
                        className={inputClass}
                      />
                    </div>

                    {loginMode === 'otp' ? (
                      <div>
                        <label className={labelClass}>6-Digit Activation OTP *</label>
                        <input
                          type="text"
                          required
                          maxLength={6}
                          placeholder="123456"
                          value={portalOtp}
                          onChange={(e) => setPortalOtp(e.target.value.trim())}
                          className={`${inputClass} tracking-widest text-center text-[18px] font-extrabold`}
                        />
                      </div>
                    ) : (
                      <div>
                        <label className={labelClass}>Account Password *</label>
                        <input
                          type="password"
                          required
                          placeholder="Enter your password"
                          value={portalPassword}
                          onChange={(e) => setPortalPassword(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={portalLoading}
                      className={`${primaryBtnClass} w-full`}
                    >
                      {portalLoading
                        ? 'Authenticating...'
                        : loginMode === 'otp'
                        ? 'Verify OTP & Continue'
                        : 'Sign In to Partner Dashboard'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* STEP 2: SET PERMANENT PASSWORD */}
            {portalStep === 'setup_password' && (
              <div className={`max-w-lg mx-auto rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                <div className={`px-6 py-4 border-b ${sectionHeaderBg}`}>
                  <h2 className="text-[19px] font-extrabold">Set Your Account Password</h2>
                </div>
                <div className="p-6 sm:p-8 space-y-5">
                  <p className="text-[14px] font-medium">
                    Your OTP has been verified. Please create a permanent password to access your partner dashboard.
                  </p>

                  {setupError && (
                    <div className="p-3.5 rounded-[4px] bg-[#fef2f2] border border-[#f87171] text-[#991b1b] text-[14px] font-bold">
                      {setupError}
                    </div>
                  )}

                  <form onSubmit={handleSetupPassword} className="space-y-5">
                    <div>
                      <label className={labelClass}>New Password (Minimum 6 characters) *</label>
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Confirm New Password *</label>
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={inputClass}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={setupLoading}
                      className={`${primaryBtnClass} w-full`}
                    >
                      {setupLoading ? 'Saving Password...' : 'Save Password & Enter Dashboard'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* STEP 3: REAL-TIME DRIVER & TOUR GUIDE DASHBOARDS */}
            {portalStep === 'dashboard' && portalUser && (
              <div className="space-y-6">
                {/* Dashboard Top Header & Operational Availability Controls */}
                <div className={`rounded-[4px] border ${panelBg} p-6 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4`}>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-[22px] font-extrabold">
                        {driverDashboard?.fullName || guideDashboard?.guide?.fullName || portalUser.full_name}
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-[4px] text-[12px] font-extrabold border border-current/25 uppercase">
                        {portalUser.role === 'tour_guide' ? 'Certified Tour Guide' : 'Approved Safari Driver'}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-[4px] text-[12px] font-extrabold uppercase ${
                        isOnline
                          ? activeTrip
                            ? 'bg-[#2563eb] text-white'
                            : 'bg-[#10b981] text-white'
                          : 'bg-slate-500/20 text-slate-500'
                      }`}>
                        {portalUser.role === 'tour_guide'
                          ? isOnline ? 'AVAILABLE FOR TOURS' : 'UNAVAILABLE'
                          : !isOnline
                          ? 'OFFLINE'
                          : activeTrip
                          ? 'ASSIGNED / ON TRIP'
                          : 'ONLINE & AVAILABLE'}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-[4px] text-[11px] font-mono font-bold border border-current/20">
                        {streamConnected ? 'LIVE STREAM CONNECTED' : 'RECONNECTING...'}
                      </span>
                    </div>
                    <p className="text-[14px] font-semibold opacity-75">
                      {driverDashboard?.email || guideDashboard?.guide?.email || portalUser.email} • {driverDashboard?.phone || guideDashboard?.guide?.phone || portalUser.phone}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    <button
                      type="button"
                      onClick={handleToggleOnline}
                      disabled={statusUpdating}
                      className={`px-5 py-2.5 rounded-[4px] font-bold text-[14px] transition-colors disabled:opacity-50 ${
                        isOnline
                          ? 'bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-900'
                          : primaryBtnClass
                      }`}
                    >
                      {statusUpdating
                        ? 'Updating...'
                        : portalUser.role === 'tour_guide'
                        ? isOnline ? 'Status: Available (Set Unavailable)' : 'Set Available for Tours'
                        : isOnline ? 'Status: Online (Go Offline)' : 'Go Online & Available'}
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPartnerDashboard(portalAuthToken, portalUser.role)}
                      disabled={dashboardLoading}
                      className={secondaryBtnClass}
                    >
                      {dashboardLoading ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <button
                      type="button"
                      onClick={handlePortalLogout}
                      className={secondaryBtnClass}
                    >
                      Log Out
                    </button>
                  </div>
                </div>

                {operationalFeedback && (
                  <div className={`p-4 rounded-[4px] border text-[14px] font-bold ${
                    operationalFeedback.type === 'success'
                      ? 'bg-[#ecfdf5] border-[#34d399] text-[#065f46]'
                      : 'bg-[#fef2f2] border-[#f87171] text-[#991b1b]'
                  }`}>
                    {operationalFeedback.text}
                  </div>
                )}

                {/* ========================================================= */}
                {/* ROLE A: DRIVER OPERATIONAL DASHBOARD                      */}
                {/* ========================================================= */}
                {portalUser.role !== 'tour_guide' ? (
                  <>
                    {/* Row 1: Vehicle Credentials, Earnings & Wallet, Live GPS Feed */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Card 1: Accreditation & Vehicle */}
                      <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                        <div className={`px-5 py-3 border-b ${sectionHeaderBg}`}>
                          <h3 className="text-[14px] font-extrabold uppercase">Vehicle &amp; Accreditation</h3>
                        </div>
                        <div className="p-5 space-y-3 text-[14px]">
                          <div>
                            <span className="block text-[12px] font-bold uppercase opacity-60">Assigned Vehicle</span>
                            <span className="font-extrabold">
                              {driverDashboard?.vehicle?.make || portalUser.vehicle_details?.make || 'Toyota'}{' '}
                              {driverDashboard?.vehicle?.model || portalUser.vehicle_details?.model || 'Safari 4x4'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[12px] font-bold uppercase opacity-60">Registration Plate</span>
                            <span className="font-extrabold font-mono">
                              {driverDashboard?.vehicle?.registration_plate || portalUser.vehicle_details?.registration_plate || portalUser.driver_details?.license_number || 'REGISTERED'}
                            </span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-current/10">
                            <span className="text-[12px] font-bold uppercase opacity-60">Tier / Permit</span>
                            <span className="font-extrabold uppercase">
                              {driverDashboard?.vehicle?.tier || portalUser.vehicle_details?.tier || 'safari_4x4'} • {driverDashboard?.licenseNumber || 'VERIFIED'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card 2: Real Earnings & Trip Metrics */}
                      <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                        <div className={`px-5 py-3 border-b ${sectionHeaderBg}`}>
                          <h3 className="text-[14px] font-extrabold uppercase">Earnings &amp; Performance</h3>
                        </div>
                        <div className="p-5 space-y-3 text-[14px]">
                          <div className="flex justify-between border-b border-current/10 pb-2">
                            <span className="font-semibold">Today&apos;s Earnings:</span>
                            <span className="font-extrabold font-mono">
                              UGX {Number(driverDashboard?.todayEarningsUGX || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-current/10 pb-2">
                            <span className="font-semibold">Wallet Balance:</span>
                            <span className="font-extrabold font-mono text-emerald-700 dark:text-emerald-400">
                              UGX {Number(driverDashboard?.walletBalanceUGX || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-current/10 pb-2">
                            <span className="font-semibold">Completed Trips:</span>
                            <span className="font-extrabold font-mono">
                              {driverDashboard?.totalTrips ?? completedTrips.length} (Today: {driverDashboard?.completedTripsToday ?? 0})
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-1">
                            <span className="font-semibold">Rating: ★ {driverDashboard?.rating || 5.0}</span>
                            <button
                              type="button"
                              onClick={handleCashoutWallet}
                              disabled={actionBusyId === 'cashout' || !(driverDashboard?.walletBalanceUGX > 0)}
                              className={secondaryBtnClass}
                            >
                              {actionBusyId === 'cashout' ? 'Processing...' : 'Withdraw Funds'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Card 3: Live GPS Telemetry */}
                      <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                        <div className={`px-5 py-3 border-b ${sectionHeaderBg}`}>
                          <h3 className="text-[14px] font-extrabold uppercase">Live GPS Telemetry</h3>
                        </div>
                        <div className="p-5 space-y-2.5 text-[14px]">
                          <div className="flex justify-between">
                            <span className="font-semibold">Coordinates:</span>
                            <span className="font-extrabold font-mono">{currentLat.toFixed(5)}, {currentLng.toFixed(5)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-semibold">Speed / Heading:</span>
                            <span className="font-extrabold font-mono">{speed} km/h • {Math.round(heading)}°</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-semibold">Last Dispatch Sync:</span>
                            <span className="font-extrabold font-mono">{lastLocationPing || 'Live Ready'}</span>
                          </div>

                          <button
                            type="button"
                            onClick={handleTransmitGps}
                            disabled={transmittingGps}
                            className={`${primaryBtnClass} w-full mt-2`}
                          >
                            {transmittingGps ? 'Transmitting GPS...' : 'Transmit Current GPS Location'}
                          </button>

                          {gpsFeedback && (
                            <p className={`text-[12px] font-bold pt-1 ${
                              gpsFeedback.type === 'error' ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'
                            }`}>
                              {gpsFeedback.text}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Active Assigned Trip (if any) */}
                    {activeTrip && (
                      <div className={`rounded-[4px] border-2 border-[#2563eb] ${panelBg} shadow-sm overflow-hidden`}>
                        <div className="px-6 py-3.5 bg-[#2563eb] text-white flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-[15px] font-extrabold uppercase tracking-wide">
                            Active Assigned Trip • Status: {activeTrip.status}
                          </h3>
                          <span className="text-[13px] font-mono font-bold">
                            Fare: UGX {Number(activeTrip.estimatedPriceUGX || activeTrip.finalPriceUGX || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="p-6 space-y-5">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[14px]">
                            <div>
                              <span className="block text-[12px] font-bold uppercase opacity-60">Customer</span>
                              <span className="font-extrabold">{activeTrip.customerName || 'Mumwe Safaris Passenger'}</span>
                              {activeTrip.customerPhone && (
                                <span className="block text-[13px] font-mono opacity-80">{activeTrip.customerPhone}</span>
                              )}
                            </div>
                            <div>
                              <span className="block text-[12px] font-bold uppercase opacity-60">Pickup Location</span>
                              <span className="font-extrabold">{activeTrip.pickupAddress}</span>
                              <span className="block text-[12px] font-mono opacity-70">
                                ({Number(activeTrip.pickupLat).toFixed(4)}, {Number(activeTrip.pickupLng).toFixed(4)})
                              </span>
                            </div>
                            <div>
                              <span className="block text-[12px] font-bold uppercase opacity-60">Destination</span>
                              <span className="font-extrabold">{activeTrip.dropoffAddress}</span>
                              <span className="block text-[12px] font-mono opacity-70">
                                {activeTrip.distanceKm} km • ({Number(activeTrip.dropoffLat).toFixed(4)}, {Number(activeTrip.dropoffLng).toFixed(4)})
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-current/10">
                            {activeTrip.status === 'DRIVER_ASSIGNED' && (
                              <button
                                type="button"
                                disabled={actionBusyId === activeTrip.id}
                                onClick={() => handleUpdateActiveTripStatus(activeTrip.id, 'DRIVER_ARRIVING')}
                                className={primaryBtnClass}
                              >
                                En Route to Pickup (DRIVER_ARRIVING)
                              </button>
                            )}
                            {(activeTrip.status === 'DRIVER_ASSIGNED' || activeTrip.status === 'DRIVER_ARRIVING') && (
                              <button
                                type="button"
                                disabled={actionBusyId === activeTrip.id}
                                onClick={() => handleUpdateActiveTripStatus(activeTrip.id, 'DRIVER_ARRIVED')}
                                className={primaryBtnClass}
                              >
                                Mark Arrived at Pickup (DRIVER_ARRIVED)
                              </button>
                            )}
                            {(activeTrip.status === 'DRIVER_ARRIVED' || activeTrip.status === 'DRIVER_ASSIGNED' || activeTrip.status === 'DRIVER_ARRIVING') && (
                              <button
                                type="button"
                                disabled={actionBusyId === activeTrip.id}
                                onClick={() => handleUpdateActiveTripStatus(activeTrip.id, 'TRIP_STARTED')}
                                className="px-5 py-2.5 rounded-[4px] font-bold text-[14px] bg-emerald-700 hover:bg-emerald-800 text-white"
                              >
                                Start Trip (TRIP_STARTED)
                              </button>
                            )}
                            {activeTrip.status === 'TRIP_STARTED' && (
                              <button
                                type="button"
                                disabled={actionBusyId === activeTrip.id}
                                onClick={() => handleUpdateActiveTripStatus(activeTrip.id, 'TRIP_COMPLETED')}
                                className="px-6 py-2.5 rounded-[4px] font-bold text-[14px] bg-emerald-700 hover:bg-emerald-800 text-white"
                              >
                                Complete Trip &amp; Record Fare (TRIP_COMPLETED)
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={actionBusyId === activeTrip.id}
                              onClick={() => handleUpdateActiveTripStatus(activeTrip.id, 'CANCELLED')}
                              className="px-4 py-2.5 rounded-[4px] font-bold text-[13px] border border-red-500 text-red-600 hover:bg-red-50"
                            >
                              Cancel Trip
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Row 3: Incoming Ride Requests (Real-Time) */}
                    <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                      <div className={`px-6 py-3.5 border-b flex items-center justify-between ${sectionHeaderBg}`}>
                        <h3 className="text-[15px] font-extrabold uppercase">
                          Incoming Ride Requests ({incomingRequests.length})
                        </h3>
                        <span className="text-[12px] font-mono font-bold opacity-75">
                          Real-Time Dispatch Queue
                        </span>
                      </div>
                      <div className="p-6">
                        {!isOnline ? (
                          <p className="text-[14px] font-semibold opacity-75">
                            You are currently Offline. Switch your status to Online &amp; Available above to receive real-time customer ride requests.
                          </p>
                        ) : incomingRequests.length === 0 ? (
                          <p className="text-[14px] font-semibold opacity-75">
                            Listening for incoming customer ride requests in your area... New requests will appear here automatically without refreshing.
                          </p>
                        ) : (
                          <div className="space-y-4">
                            {incomingRequests.map((req) => {
                              const reqId = req.tripId || req.id;
                              return (
                                <div
                                  key={reqId}
                                  className={`p-4 rounded-[4px] border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                                    isLight ? 'bg-[#f8fafc] border-[#cbd5e1]' : 'bg-[#181b22] border-[#2d323e]'
                                  }`}
                                >
                                  <div className="space-y-1 text-[14px]">
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-[16px]">
                                        {req.pickupAddress} → {req.dropoffAddress}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-mono font-bold border border-current/20 uppercase">
                                        {req.vehicleTier || 'safari_4x4'}
                                      </span>
                                    </div>
                                    <p className="text-[13px] font-semibold opacity-80">
                                      Customer: {req.customerName || 'Customer'} {req.customerPhone ? `(${req.customerPhone})` : ''} • Distance: {req.distanceKm || '-'} km
                                    </p>
                                    <p className="text-[14px] font-extrabold font-mono text-emerald-700 dark:text-emerald-400">
                                      Estimated Fare: UGX {Number(req.estimatedPriceUGX || 0).toLocaleString()}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2.5 shrink-0">
                                    <button
                                      type="button"
                                      disabled={actionBusyId === reqId || Boolean(activeTrip)}
                                      onClick={() => handleAcceptRideRequest(reqId)}
                                      className="px-5 py-2.5 rounded-[4px] font-bold text-[14px] bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50"
                                    >
                                      {actionBusyId === reqId ? 'Accepting...' : 'Accept Ride'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actionBusyId === reqId}
                                      onClick={() => handleRejectRideRequest(reqId)}
                                      className={secondaryBtnClass}
                                    >
                                      Decline
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 4: Completed Rides & Notifications */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                        <div className={`px-5 py-3 border-b ${sectionHeaderBg}`}>
                          <h3 className="text-[14px] font-extrabold uppercase">
                            Completed Rides History ({completedTrips.length})
                          </h3>
                        </div>
                        <div className="p-5 max-h-[320px] overflow-y-auto space-y-3 text-[13px]">
                          {completedTrips.length === 0 ? (
                            <p className="opacity-70 font-medium">No completed trips recorded yet.</p>
                          ) : (
                            completedTrips.map((t) => (
                              <div key={t.id} className="pb-3 border-b border-current/10 last:border-b-0">
                                <div className="flex justify-between font-extrabold">
                                  <span>{t.pickupAddress} → {t.dropoffAddress}</span>
                                  <span className="font-mono">UGX {Number(t.finalPriceUGX || t.estimatedPriceUGX || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-[12px] opacity-70 mt-0.5">
                                  <span>{t.distanceKm} km • {t.status}</span>
                                  <span>{t.completedAt ? new Date(t.completedAt).toLocaleString() : ''}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                        <div className={`px-5 py-3 border-b ${sectionHeaderBg}`}>
                          <h3 className="text-[14px] font-extrabold uppercase">
                            Operational Notifications ({partnerNotifications.length})
                          </h3>
                        </div>
                        <div className="p-5 max-h-[320px] overflow-y-auto space-y-3 text-[13px]">
                          {partnerNotifications.length === 0 ? (
                            <p className="opacity-70 font-medium">No notifications yet.</p>
                          ) : (
                            partnerNotifications.slice(0, 15).map((n) => (
                              <div key={n.id} className="pb-3 border-b border-current/10 last:border-b-0">
                                <p className="font-extrabold">{n.title}</p>
                                <p className="opacity-80 mt-0.5">{n.body}</p>
                                <span className="block text-[11px] font-mono opacity-60 mt-1">
                                  {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  /* ========================================================= */
                  /* ROLE B: TOUR GUIDE OPERATIONAL DASHBOARD                  */
                  /* ========================================================= */
                  <>
                    {/* Row 1: Guide Profile, Specialties & Earnings */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                        <div className={`px-5 py-3 border-b ${sectionHeaderBg}`}>
                          <h3 className="text-[14px] font-extrabold uppercase">UWA Guide Accreditation</h3>
                        </div>
                        <div className="p-5 space-y-3 text-[14px]">
                          <div>
                            <span className="block text-[12px] font-bold uppercase opacity-60">License Number</span>
                            <span className="font-extrabold font-mono">
                              {guideDashboard?.guide?.licenseNumber || portalUser.guide_details?.license_number || 'UWA CERTIFIED'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[12px] font-bold uppercase opacity-60">Languages</span>
                            <span className="font-extrabold">
                              {(guideDashboard?.guide?.languages || ['English']).join(', ')}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[12px] font-bold uppercase opacity-60">Specialties</span>
                            <span className="font-extrabold">
                              {(guideDashboard?.guide?.specialties || ['Wildlife Safari']).join(', ')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                        <div className={`px-5 py-3 border-b ${sectionHeaderBg}`}>
                          <h3 className="text-[14px] font-extrabold uppercase">Safari Assignments Summary</h3>
                        </div>
                        <div className="p-5 space-y-3 text-[14px]">
                          <div className="flex justify-between border-b border-current/10 pb-2">
                            <span className="font-semibold">Active Assigned Tours:</span>
                            <span className="font-extrabold font-mono">
                              {guideDashboard?.activeBookings?.length ?? guideBookings.filter((b) => b.bookingStatus !== 'COMPLETED' && b.bookingStatus !== 'CANCELLED').length}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-current/10 pb-2">
                            <span className="font-semibold">Completed Tours:</span>
                            <span className="font-extrabold font-mono">
                              {guideDashboard?.completedToursCount ?? 0}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-semibold">Guide Rating:</span>
                            <span className="font-extrabold font-mono">★ {guideDashboard?.guide?.rating || 5.0}</span>
                          </div>
                        </div>
                      </div>

                      <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                        <div className={`px-5 py-3 border-b ${sectionHeaderBg}`}>
                          <h3 className="text-[14px] font-extrabold uppercase">Earnings &amp; Daily Rate</h3>
                        </div>
                        <div className="p-5 space-y-3 text-[14px]">
                          <div className="flex justify-between border-b border-current/10 pb-2">
                            <span className="font-semibold">Daily Guide Fee:</span>
                            <span className="font-extrabold font-mono">
                              UGX {Number(guideDashboard?.guide?.dailyRateUGX || 150000).toLocaleString()} / day
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-current/10 pb-2">
                            <span className="font-semibold">Completed Tour Earnings:</span>
                            <span className="font-extrabold font-mono text-emerald-700 dark:text-emerald-400">
                              UGX {Number(guideDashboard?.totalEarningsUGX || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-semibold">Approval Status:</span>
                            <span className="font-extrabold uppercase">
                              {guideDashboard?.guide?.approvalStatus || 'APPROVED'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Assigned Safari Bookings */}
                    <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                      <div className={`px-6 py-3.5 border-b flex items-center justify-between ${sectionHeaderBg}`}>
                        <h3 className="text-[15px] font-extrabold uppercase">
                          Assigned Safari Tours &amp; Customer Bookings ({guideBookings.length})
                        </h3>
                        <span className="text-[12px] font-mono font-bold opacity-75">
                          Real-Time Assignment Feed
                        </span>
                      </div>
                      <div className="p-6">
                        {guideBookings.length === 0 ? (
                          <p className="text-[14px] font-semibold opacity-75">
                            No safari tours are currently assigned to your account. When a customer books a tour with you or an administrator assigns a safari booking to you, it will appear here immediately in real time.
                          </p>
                        ) : (
                          <div className="space-y-4">
                            {guideBookings.map((b) => {
                              const status = String(b.bookingStatus || 'CONFIRMED').toUpperCase();
                              return (
                                <div
                                  key={b.id}
                                  className={`p-5 rounded-[4px] border space-y-4 ${
                                    isLight ? 'bg-[#f8fafc] border-[#cbd5e1]' : 'bg-[#181b22] border-[#2d323e]'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-current/10 pb-3">
                                    <div>
                                      <h4 className="text-[17px] font-extrabold">
                                        {b.package?.title || b.destination?.name || 'Custom Uganda Safari Expedition'}
                                      </h4>
                                      <p className="text-[13px] font-semibold opacity-80 mt-0.5">
                                        Destination: {b.destination?.name || b.package?.parkLocation || 'Uganda National Park'} • Duration: {b.package?.durationDays || 1} Days • Guests: {b.guestsCount || 1}
                                      </p>
                                    </div>
                                    <span className="px-3 py-1 rounded-[4px] text-[12px] font-mono font-extrabold border border-current/25 uppercase">
                                      {status}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[14px]">
                                    <div>
                                      <span className="block text-[12px] font-bold uppercase opacity-60">Customer Details</span>
                                      <span className="font-extrabold">{b.customer?.fullName || 'Safari Guest'}</span>
                                      <span className="block text-[13px] font-mono opacity-80">
                                        {b.customer?.phone || '-'} {b.customer?.email ? `• ${b.customer.email}` : ''}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="block text-[12px] font-bold uppercase opacity-60">Travel Date &amp; Coordinates</span>
                                      <span className="font-extrabold">
                                        {b.travelDate ? new Date(b.travelDate).toLocaleDateString() : 'Scheduled'}
                                      </span>
                                      {b.destination?.lat != null && (
                                        <span className="block text-[12px] font-mono opacity-75">
                                          Park GPS: {b.destination.lat}, {b.destination.lng}
                                        </span>
                                      )}
                                    </div>
                                    <div>
                                      <span className="block text-[12px] font-bold uppercase opacity-60">Booking Value</span>
                                      <span className="font-extrabold font-mono">
                                        UGX {Number(b.totalAmountUGX || 0).toLocaleString()}
                                      </span>
                                      {b.specialRequests && (
                                        <span className="block text-[12px] opacity-80 mt-0.5">
                                          Notes: {b.specialRequests}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {Array.isArray(b.package?.itinerary) && b.package.itinerary.length > 0 && (
                                    <div className="pt-2 border-t border-current/10 text-[13px]">
                                      <span className="block text-[11px] font-bold uppercase opacity-60 mb-1">Itinerary Highlights</span>
                                      <ul className="list-disc pl-5 space-y-0.5">
                                        {b.package.itinerary.map((step: string, i: number) => (
                                          <li key={i} className="font-medium">{step}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {status !== 'COMPLETED' && status !== 'CANCELLED' && (
                                    <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-current/10">
                                      {status === 'PENDING_PAYMENT' && (
                                        <button
                                          type="button"
                                          disabled={actionBusyId === b.id}
                                          onClick={() => handleUpdateGuideBookingStatus(b.id, 'CONFIRMED')}
                                          className={primaryBtnClass}
                                        >
                                          Confirm Assignment (CONFIRMED)
                                        </button>
                                      )}
                                      {(status === 'CONFIRMED' || status === 'PENDING_PAYMENT') && (
                                        <button
                                          type="button"
                                          disabled={actionBusyId === b.id}
                                          onClick={() => handleUpdateGuideBookingStatus(b.id, 'IN_PROGRESS')}
                                          className="px-5 py-2.5 rounded-[4px] font-bold text-[14px] bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
                                        >
                                          Start Safari Expedition (IN_PROGRESS)
                                        </button>
                                      )}
                                      {status === 'IN_PROGRESS' && (
                                        <button
                                          type="button"
                                          disabled={actionBusyId === b.id}
                                          onClick={() => handleUpdateGuideBookingStatus(b.id, 'COMPLETED')}
                                          className="px-5 py-2.5 rounded-[4px] font-bold text-[14px] bg-emerald-700 hover:bg-emerald-800 text-white"
                                        >
                                          Mark Safari Completed (COMPLETED)
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 3: Guide Notifications */}
                    <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
                      <div className={`px-6 py-3.5 border-b ${sectionHeaderBg}`}>
                        <h3 className="text-[14px] font-extrabold uppercase">
                          Guide Notifications ({partnerNotifications.length})
                        </h3>
                      </div>
                      <div className="p-6 max-h-[300px] overflow-y-auto space-y-3 text-[13px]">
                        {partnerNotifications.length === 0 ? (
                          <p className="opacity-70 font-medium">No notifications yet.</p>
                        ) : (
                          partnerNotifications.map((n) => (
                            <div key={n.id} className="pb-3 border-b border-current/10 last:border-b-0">
                              <p className="font-extrabold">{n.title}</p>
                              <p className="opacity-80 mt-0.5">{n.body}</p>
                              <span className="block text-[11px] font-mono opacity-60 mt-1">
                                {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: REQUIREMENTS */}
        {/* ================================================================= */}
        {activeTab === 'requirements' && (
          <div className="space-y-6">
            <div className={`rounded-[4px] border ${panelBg} shadow-sm overflow-hidden`}>
              <div className={`px-6 py-4 border-b ${sectionHeaderBg}`}>
                <h2 className="text-[20px] font-extrabold">Mandatory Partner Qualification Requirements</h2>
              </div>
              <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <h3 className="text-[17px] font-extrabold border-b border-current/15 pb-2">
                    1. Safari Driver &amp; Chauffeur Requirements
                  </h3>
                  <ul className="list-disc pl-5 space-y-2 text-[15px] font-medium leading-relaxed">
                    <li>Valid Uganda Driving Permit (Class B, CM, DL, or DM) with an unblemished safety record.</li>
                    <li>Minimum of 2 years verifiable commercial or safari driving experience in Uganda.</li>
                    <li>Valid National Identification Card (NIN) or Passport.</li>
                    <li>Roadworthy vehicle with comprehensive insurance, working air conditioning, and valid inspection certificate.</li>
                    <li>Public Service Vehicle (PSV) badge or defensive driving certification is highly recommended.</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h3 className="text-[17px] font-extrabold border-b border-current/15 pb-2">
                    2. Licensed Tour Guide Requirements
                  </h3>
                  <ul className="list-disc pl-5 space-y-2 text-[15px] font-medium leading-relaxed">
                    <li>Valid accreditation from the Uganda Wildlife Authority (UWA) or Uganda Tourism Board (UTB).</li>
                    <li>Strong command of English; additional international languages (French, German, Spanish) are an advantage.</li>
                    <li>Extensive knowledge of Uganda national parks, wildlife conservation, and gorilla trekking protocols.</li>
                    <li>Valid First Aid certification and field emergency response readiness.</li>
                    <li>Valid National Identification Card (NIN) or Passport.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Classic Footer */}
      <footer className={`border-t ${headerBg} mt-12 py-6 text-center text-[13px] font-semibold`}>
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© 2026 Mumwe Safaris Uganda Ltd. All rights reserved.</span>
          <span>Official Recruitment &amp; Partner Portal (careers.mumwesafarisuganda.com)</span>
        </div>
      </footer>
    </div>
  );
}
