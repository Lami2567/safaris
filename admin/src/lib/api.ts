const getApiBase = () => {
  if (typeof window !== 'undefined') {
    // In browser, always use relative path '/api/v1' to match current origin and protocol
    return '/api/v1';
  }
  return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
};

async function fetcher<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const apiBase = getApiBase();
  const token = typeof window !== 'undefined' ? localStorage.getItem('safaris_admin_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as any) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    // Standard admin access key recognized by gateway auth middleware
    headers['x-admin-key'] = process.env.NEXT_PUBLIC_ADMIN_KEY || 'mumwe_safaris_secret_jwt_2026';
  }

  const res = await fetch(`${apiBase}${endpoint}`, {
    ...options,
    headers,
    cache: 'no-store',
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message || json.message || `API request failed with status ${res.status}`);
  }
  return json.data;
}

export const api = {
  // System & KPIs
  getStats: () => fetcher<any>('/admin/stats'),
  getHealth: () => fetcher<any>('/health'),

  // App Master Config
  getConfig: () => fetcher<any>('/app-config'),
  updateConfig: (body: any) => fetcher<any>('/app-config', { method: 'PUT', body: JSON.stringify(body) }),
  updateServices: (services: any[]) => fetcher<any>('/app-config/services', { method: 'PUT', body: JSON.stringify({ services }) }),
  updateBanners: (banners: any[]) => fetcher<any>('/app-config/banners', { method: 'PUT', body: JSON.stringify({ banners }) }),
  updateFeatures: (features: Record<string, boolean>) => fetcher<any>('/app-config/features', { method: 'PUT', body: JSON.stringify({ features }) }),
  updateVersionConfig: (versionConfig: any) => fetcher<any>('/app-config/version', { method: 'PUT', body: JSON.stringify({ versionConfig }) }),
  updatePaymentMethods: (paymentMethods: any[]) => fetcher<any>('/app-config/payment-methods', { method: 'PUT', body: JSON.stringify({ paymentMethods }) }),

  // Destinations
  getDestinations: (includeDrafts = true) =>
    fetcher<any[]>(`/tourism/destinations${includeDrafts ? '?includeDrafts=true' : ''}`),
  createDestination: (data: any) => fetcher<any>('/tourism/destinations', { method: 'POST', body: JSON.stringify(data) }),
  updateDestination: (id: string, data: any) => fetcher<any>(`/tourism/destinations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  duplicateDestination: (id: string) => fetcher<any>(`/tourism/destinations/${id}/duplicate`, { method: 'POST' }),
  deleteDestination: (id: string) => fetcher<any>(`/tourism/destinations/${id}`, { method: 'DELETE' }),

  // Tour Packages
  getPackages: (destinationId?: string, includeDrafts = true) => {
    const q = new URLSearchParams();
    if (destinationId) q.set('destinationId', destinationId);
    if (includeDrafts) q.set('includeDrafts', 'true');
    const qs = q.toString();
    return fetcher<any[]>(`/tourism/packages${qs ? `?${qs}` : ''}`);
  },
  createPackage: (data: any) => fetcher<any>('/tourism/packages', { method: 'POST', body: JSON.stringify(data) }),
  updatePackage: (id: string, data: any) => fetcher<any>(`/tourism/packages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  duplicatePackage: (id: string) => fetcher<any>(`/tourism/packages/${id}/duplicate`, { method: 'POST' }),
  deletePackage: (id: string) => fetcher<any>(`/tourism/packages/${id}`, { method: 'DELETE' }),

  // Tour Guides
  getGuides: () => fetcher<any[]>('/guides'),
  createGuide: (data: any) => fetcher<any>('/guides', { method: 'POST', body: JSON.stringify(data) }),
  updateGuide: (id: string, data: any) => fetcher<any>(`/guides/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGuide: (id: string) => fetcher<any>(`/guides/${id}`, { method: 'DELETE' }),

  // Bookings
  getBookings: () => fetcher<any[]>('/tourism/bookings'),
  updateBookingStatus: (id: string, status: string) => fetcher<any>(`/tourism/bookings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  assignGuideToBooking: (id: string, guideId: string) =>
    fetcher<any>(`/tourism/bookings/${id}/assign-guide`, { method: 'PUT', body: JSON.stringify({ guideId }) }),

  // Pricing Matrix, Centralized Vehicle Catalogue & Server Quotation Engine
  getPricing: () => fetcher<any>('/admin/pricing'),
  updatePricing: (pricing: any) => fetcher<any>('/admin/pricing', { method: 'PUT', body: JSON.stringify(pricing) }),
  getCatalogueVehicles: (params?: { service?: string; includeInactive?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.service) q.set('service', params.service);
    if (params?.includeInactive !== false) q.set('includeInactive', 'true');
    const qs = q.toString();
    return fetcher<any[]>(`/catalogue/vehicles${qs ? `?${qs}` : ''}`);
  },
  upsertCatalogueVehicle: (data: any) =>
    fetcher<any>(data.id ? `/admin/catalogue/vehicles/${data.id}` : '/admin/catalogue/vehicles', {
      method: data.id ? 'PUT' : 'POST',
      body: JSON.stringify(data),
    }),
  deleteCatalogueVehicle: (id: string) =>
    fetcher<any>(`/admin/catalogue/vehicles/${id}`, { method: 'DELETE' }),
  getServicePricingRules: () => fetcher<any>('/pricing/rules'),
  updateServicePricingRule: (serviceKey: string, data: any) =>
    fetcher<any>(`/admin/pricing/rules/${serviceKey}`, { method: 'PUT', body: JSON.stringify(data) }),
  calculateQuote: (data: any) =>
    fetcher<any>('/pricing/quote', { method: 'POST', body: JSON.stringify(data) }),

  // Operations Monitors
  getTrips: () => fetcher<any[]>('/admin/trips'),
  getDeliveries: () => fetcher<any[]>('/admin/deliveries'),
  getFleet: () => fetcher<any[]>('/admin/fleet'),
  getUsers: () => fetcher<any[]>('/admin/users'),

  // Real-Time Fleet Telemetry & Audit Logs
  getLiveFleet: () => fetcher<any[]>('/admin/live-fleet'),
  getLiveFleetStreamUrl: (token?: string) => {
    const effectiveToken = token || (typeof window !== 'undefined' ? localStorage.getItem('safaris_admin_token') : null);
    return `${getApiBase()}/admin/live-fleet/stream${effectiveToken ? `?token=${encodeURIComponent(effectiveToken)}` : ''}`;
  },
  getPartnerStreamUrl: (token?: string) => `${getApiBase()}/telemetry/partner/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`,
  getDriverHistory: (driverId: string, date?: string) =>
    fetcher<any>(`/telemetry/drivers/${driverId}/history${date ? `?date=${date}` : ''}`),
  getTripHistory: (tripId: string) => fetcher<any>(`/telemetry/trips/${tripId}/history`),
  logAudit: (data: { action: string; resourceType: string; resourceId: string; details?: any }) =>
    fetcher<any>('/admin/audit-log', { method: 'POST', body: JSON.stringify(data) }),
  getAuditLogs: (limit?: number) => fetcher<any[]>(`/admin/audit-logs${limit ? `?limit=${limit}` : ''}`),

  // Careers & Driver/Tour Guide Approvals
  submitCareerApplication: (data: any) =>
    fetcher<any>('/careers/apply', { method: 'POST', body: JSON.stringify(data) }),
  requestCareerStatusLink: (email: string) =>
    fetcher<any>('/careers/status-link', { method: 'POST', body: JSON.stringify({ email }) }),
  checkCareerStatus: (statusToken: string) =>
    fetcher<any>('/careers/status', { method: 'POST', body: JSON.stringify({ statusToken }) }),
  getApplicants: (status?: string, type?: string) => {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.append('status', status);
    if (type && type !== 'all') params.append('type', type);
    const qs = params.toString();
    return fetcher<any[]>(`/admin/applicants${qs ? `?${qs}` : ''}`);
  },
  approveApplicant: (id: string) => fetcher<any>(`/admin/applicants/${id}/approve`, { method: 'POST' }),
  rejectApplicant: (id: string, reason: string) =>
    fetcher<any>(`/admin/applicants/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  suspendApplicant: (id: string, reason?: string) =>
    fetcher<any>(`/admin/applicants/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Admin Account & Password Management
  getAdminAuthStatus: () => fetcher<any>('/admin/auth-status'),
  adminLogin: (data: any) => fetcher<any>('/admin/login', { method: 'POST', body: JSON.stringify(data) }),
  setupAdminCredentials: (data: any) =>
    fetcher<any>('/admin/setup-credentials', { method: 'POST', body: JSON.stringify(data) }),
  changeAdminPassword: (data: { currentPassword: string; newPassword: string }) =>
    fetcher<any>('/admin/change-password', { method: 'POST', body: JSON.stringify(data) }),

  // Partner & Driver OTP Login and Live Dashboard
  loginPartner: (email: string, password?: string) =>
    fetcher<any>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  loginWithOtp: (email: string, otpCode: string) =>
    fetcher<any>('/auth/login-with-otp', { method: 'POST', body: JSON.stringify({ email, otpCode }) }),
  setupPassword: (email: string, setupToken: string, newPassword: string) =>
    fetcher<any>('/auth/setup-password', { method: 'POST', body: JSON.stringify({ email, setupToken, newPassword }) }),
  getGuideDashboard: (token?: string) =>
    fetcher<any>('/guides/dashboard', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  setGuideAvailability: (isAvailable: boolean, token?: string) =>
    fetcher<any>('/guides/availability', {
      method: 'POST',
      body: JSON.stringify({ isAvailable }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  getPartnerNotifications: (partnerId: string, token?: string) =>
    fetcher<any[]>(`/notifications/partner/${partnerId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  acceptTrip: (tripId: string, token?: string) =>
    fetcher<any>(`/trips/${tripId}/accept`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  rejectTrip: (tripId: string, token?: string) =>
    fetcher<any>(`/trips/${tripId}/reject`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  updateTripStatus: (tripId: string, status: string, token?: string) =>
    fetcher<any>(`/trips/${tripId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  updatePartnerBookingStatus: (bookingId: string, status: string, token?: string) =>
    fetcher<any>(`/tourism/bookings/${bookingId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  driverCashOut: (token?: string) =>
    fetcher<any>('/drivers/cashout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  updateDriverLocation: (lat: number, lng: number, heading = 0, token?: string) =>
    fetcher<any>('/drivers/location', {
      method: 'POST',
      body: JSON.stringify({ lat, lng, heading }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  setDriverAvailability: (isOnline: boolean, token?: string) =>
    fetcher<any>('/drivers/status', {
      method: 'POST',
      body: JSON.stringify({ isOnline }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  getDriverDashboard: (token?: string) =>
    fetcher<any>('/drivers/dashboard', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  // DPO Payments & Gateway Administration
  getPayments: (params?: {
    status?: string;
    payment_environment?: string;
    service_type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.payment_environment) q.set('payment_environment', params.payment_environment);
    if (params?.service_type) q.set('service_type', params.service_type);
    if (params?.search) q.set('search', params.search);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    const qs = q.toString();
    return fetcher<{
      payments: any[];
      total: number;
      limit: number;
      offset: number;
      environment: string;
    }>(`/admin/payments${qs ? `?${qs}` : ''}`);
  },
  getPaymentStats: () =>
    fetcher<{
      total_count: number;
      successful_count: number;
      pending_count: number;
      failed_count: number;
      sandbox_count: number;
      live_count: number;
      total_live_collected_ugx: number;
      total_sandbox_tested_ugx: number;
      current_environment: string;
    }>('/admin/payments/stats'),
  getDpoConfigStatus: () =>
    fetcher<{
      environment: string;
      configured: boolean;
      validation_error: string | null;
      live_checklist: {
        token_present: boolean;
        service_type_confirmed: boolean;
        endpoints_verified: boolean;
        credentials_in_secret_store: boolean;
        operator_authorized: boolean;
        backend_validated: boolean;
        dpo_verification_passed: boolean;
        environment_recorded: boolean;
      };
      service_type_id: string;
      ticket_ref: string;
      active_gateway_endpoint: string;
    }>('/admin/payments/config-status'),
  reconcilePayment: (paymentId: string) =>
    fetcher<any>(`/admin/payments/${paymentId}/reconcile`, { method: 'POST' }),
  reconcileOpenPayments: () =>
    fetcher<any>('/admin/payments/reconcile-open', { method: 'POST' }),

  // Financial Engine, Customer Wallets & Automatic Refunds
  getFinancialOverview: (environment?: string) =>
    fetcher<any>(`/admin/financials/overview${environment ? `?environment=${environment}` : ''}`),
  getEarningsLedger: (environment?: string, search?: string) => {
    const q = new URLSearchParams();
    if (environment) q.set('environment', environment);
    if (search) q.set('search', search);
    const qs = q.toString();
    return fetcher<any>(`/admin/financials/ledger${qs ? `?${qs}` : ''}`);
  },
  getRefundPolicies: () => fetcher<{ policies: any[] }>('/admin/refund-policies'),
  updateRefundPolicy: (id: string, data: any) =>
    fetcher<any>(`/admin/refund-policies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getRefunds: (environment?: string) =>
    fetcher<{ count: number; environment: string; refunds: any[] }>(`/admin/refunds${environment ? `?environment=${environment}` : ''}`),
  createRefund: (data: any) =>
    fetcher<any>('/admin/refunds', { method: 'POST', body: JSON.stringify(data) }),
  triggerRefundWorker: () =>
    fetcher<any>('/admin/refunds/run-worker', { method: 'POST' }),
  recordFinancialAdjustment: (data: any) =>
    fetcher<any>('/admin/financial-adjustments', { method: 'POST', body: JSON.stringify(data) }),
  getDoubleEntryLedger: (environment?: string) =>
    fetcher<any>(`/admin/financials/double-entry${environment ? `?environment=${environment}` : ''}`),
  getAdminPayouts: (environment?: string, status?: string) => {
    const q = new URLSearchParams();
    if (environment) q.set('environment', environment);
    if (status) q.set('status', status);
    const qs = q.toString();
    return fetcher<any>(`/admin/financials/payouts${qs ? `?${qs}` : ''}`);
  },
  executeAdminPayout: (id: string) =>
    fetcher<any>(`/admin/financials/payouts/${id}/execute`, { method: 'POST' }),
  reconcileAdminPayout: (id: string, data: { confirmedSuccess: boolean; providerReference?: string; reason: string }) =>
    fetcher<any>(`/admin/financials/payouts/${id}/reconcile`, { method: 'POST', body: JSON.stringify(data) }),
  getReconciliationStatus: (environment?: string) =>
    fetcher<any>(`/admin/financials/reconciliation${environment ? `?environment=${environment}` : ''}`),
  runReconciliationEngine: (environment?: string) =>
    fetcher<any>('/admin/financials/reconciliation/run', { method: 'POST', body: JSON.stringify({ environment }) }),
  importSettlementReport: (data: { settlementRef: string; environment?: string; records: any[] }) =>
    fetcher<any>('/admin/financials/settlements/import', { method: 'POST', body: JSON.stringify(data) }),
};
