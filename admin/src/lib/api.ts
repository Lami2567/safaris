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
  getDestinations: () => fetcher<any[]>('/tourism/destinations'),
  createDestination: (data: any) => fetcher<any>('/tourism/destinations', { method: 'POST', body: JSON.stringify(data) }),
  updateDestination: (id: string, data: any) => fetcher<any>(`/tourism/destinations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDestination: (id: string) => fetcher<any>(`/tourism/destinations/${id}`, { method: 'DELETE' }),

  // Tour Packages
  getPackages: (destinationId?: string) => fetcher<any[]>(destinationId ? `/tourism/packages?destinationId=${destinationId}` : '/tourism/packages'),
  createPackage: (data: any) => fetcher<any>('/tourism/packages', { method: 'POST', body: JSON.stringify(data) }),
  updatePackage: (id: string, data: any) => fetcher<any>(`/tourism/packages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePackage: (id: string) => fetcher<any>(`/tourism/packages/${id}`, { method: 'DELETE' }),

  // Tour Guides
  getGuides: () => fetcher<any[]>('/guides'),
  createGuide: (data: any) => fetcher<any>('/guides', { method: 'POST', body: JSON.stringify(data) }),
  updateGuide: (id: string, data: any) => fetcher<any>(`/guides/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGuide: (id: string) => fetcher<any>(`/guides/${id}`, { method: 'DELETE' }),

  // Bookings
  getBookings: () => fetcher<any[]>('/tourism/bookings'),
  updateBookingStatus: (id: string, status: string) => fetcher<any>(`/tourism/bookings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),

  // Pricing Matrix
  getPricing: () => fetcher<any>('/admin/pricing'),
  updatePricing: (pricing: any) => fetcher<any>('/admin/pricing', { method: 'PUT', body: JSON.stringify(pricing) }),

  // Operations Monitors
  getTrips: () => fetcher<any[]>('/admin/trips'),
  getDeliveries: () => fetcher<any[]>('/admin/deliveries'),
  getFleet: () => fetcher<any[]>('/admin/fleet'),
  getUsers: () => fetcher<any[]>('/admin/users'),

  // Real-Time Fleet Telemetry & Audit Logs
  getLiveFleet: () => fetcher<any[]>('/admin/live-fleet'),
  getDriverHistory: (driverId: string, date?: string) =>
    fetcher<any>(`/telemetry/drivers/${driverId}/history${date ? `?date=${date}` : ''}`),
  getTripHistory: (tripId: string) => fetcher<any>(`/telemetry/trips/${tripId}/history`),
  logAudit: (data: { action: string; resourceType: string; resourceId: string; details?: any }) =>
    fetcher<any>('/admin/audit-log', { method: 'POST', body: JSON.stringify(data) }),
  getAuditLogs: (limit?: number) => fetcher<any[]>(`/admin/audit-logs${limit ? `?limit=${limit}` : ''}`),

  // Careers & Driver/Tour Guide Approvals
  submitCareerApplication: (data: any) =>
    fetcher<any>('/careers/apply', { method: 'POST', body: JSON.stringify(data) }),
  checkCareerStatus: (query: string) =>
    fetcher<any>(`/careers/status?query=${encodeURIComponent(query)}`),
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
  changeAdminPassword: (data: { currentPassword: string; newPassword: string }) =>
    fetcher<any>('/admin/change-password', { method: 'POST', body: JSON.stringify(data) }),

  // Partner & Driver OTP Login and Live Dashboard
  loginWithOtp: (email: string, otpCode: string) =>
    fetcher<any>('/auth/login-with-otp', { method: 'POST', body: JSON.stringify({ email, otpCode }) }),
  setupPassword: (email: string, setupToken: string, newPassword: string) =>
    fetcher<any>('/auth/setup-password', { method: 'POST', body: JSON.stringify({ email, setupToken, newPassword }) }),
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
};
