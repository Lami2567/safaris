const getApiBase = () => {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/v1`;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://18.222.41.199/api/v1';
};

async function fetcher<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
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
};
