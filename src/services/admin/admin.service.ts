import { localStore, db } from '../../config/database';
import { ENV } from '../../config/env';

export interface PricingConfig {
  boda: { baseFare: number; perKm: number; perMin: number; minFare: number };
  economy: { baseFare: number; perKm: number; perMin: number; minFare: number };
  comfort: { baseFare: number; perKm: number; perMin: number; minFare: number };
  safari: { baseFare: number; perKm: number; perMin: number; minFare: number };
  delivery: { baseFare: number; perKm: number; perKg: number; minFare: number };
}

const DEFAULT_PRICING: PricingConfig = {
  boda: { baseFare: 2000, perKm: 1000, perMin: 150, minFare: 2500 },
  economy: { baseFare: 5000, perKm: 2000, perMin: 250, minFare: 7000 },
  comfort: { baseFare: 8000, perKm: 3000, perMin: 350, minFare: 12000 },
  safari: { baseFare: 35000, perKm: 6500, perMin: 600, minFare: 60000 },
  delivery: { baseFare: 3000, perKm: 1200, perKg: 500, minFare: 3500 },
};

export class AdminService {
  public static getDashboardStats() {
    const totalUsers = localStore.users.size;
    const totalDrivers = localStore.drivers.size;
    const totalGuides = localStore.tour_guides.size;
    const totalDestinations = localStore.destinations.size;
    const totalPackages = localStore.tour_packages.size;
    const totalTrips = localStore.trips.size;
    const totalBookings = localStore.tour_bookings.size;
    const totalDeliveries = localStore.deliveries.size;

    // Calculate revenue totals
    let tripsRevenueUgx = 0;
    for (const trip of localStore.trips.values()) {
      tripsRevenueUgx += Number(trip.fare_ugx || trip.fare || 0);
    }

    let bookingsRevenueUgx = 0;
    for (const b of localStore.tour_bookings.values()) {
      bookingsRevenueUgx += Number(b.total_ugx || 0);
    }

    let deliveriesRevenueUgx = 0;
    for (const d of localStore.deliveries.values()) {
      deliveriesRevenueUgx += Number(d.price_ugx || d.fare_ugx || 0);
    }

    const totalRevenueUgx = tripsRevenueUgx + bookingsRevenueUgx + deliveriesRevenueUgx;

    // Active counts
    const activeTripsCount = Array.from(localStore.trips.values()).filter(
      (t: any) => ['REQUESTED', 'DRIVER_ASSIGNED', 'ARRIVED', 'IN_PROGRESS'].includes(t.status)
    ).length;

    const activeBookingsCount = Array.from(localStore.tour_bookings.values()).filter(
      (b: any) => ['PENDING', 'CONFIRMED'].includes(b.booking_status || b.status)
    ).length;

    const activeDeliveriesCount = Array.from(localStore.deliveries.values()).filter(
      (d: any) => ['PLACED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(d.status)
    ).length;

    const onlineDriversCount = Array.from(localStore.drivers.values()).filter(
      (d: any) => d.is_online && d.is_available
    ).length;

    return {
      kpis: {
        totalRevenueUgx,
        tripsRevenueUgx,
        bookingsRevenueUgx,
        deliveriesRevenueUgx,
        totalUsers,
        totalDrivers,
        onlineDriversCount,
        totalGuides,
        totalDestinations,
        totalPackages,
        totalTrips,
        activeTripsCount,
        totalBookings,
        activeBookingsCount,
        totalDeliveries,
        activeDeliveriesCount,
      },
      system: {
        environment: ENV.NODE_ENV,
        database: db.isPostgresConnected ? 'PostgreSQL 16 (Connected)' : 'In-Memory Resilient Hub',
        redis: 'Redis 7 Alpine (Active)',
        apiGateway: 'Online (/api/v1)',
        webSockets: 'Active (Port 3000)',
        serverTimestamp: new Date().toISOString(),
        version: '1.0.1',
      },
    };
  }

  // -----------------------------------------------------------
  // Pricing Configuration
  // -----------------------------------------------------------
  public static getPricing(): PricingConfig {
    const saved = localStore.app_config.get('pricing_matrix');
    return saved?.value || DEFAULT_PRICING;
  }

  public static updatePricing(pricing: Partial<PricingConfig>): PricingConfig {
    const current = this.getPricing();
    const merged: PricingConfig = {
      boda: { ...current.boda, ...(pricing.boda || {}) },
      economy: { ...current.economy, ...(pricing.economy || {}) },
      comfort: { ...current.comfort, ...(pricing.comfort || {}) },
      safari: { ...current.safari, ...(pricing.safari || {}) },
      delivery: { ...current.delivery, ...(pricing.delivery || {}) },
    };

    localStore.app_config.set('pricing_matrix', {
      key: 'pricing_matrix',
      value: merged,
      updated_at: new Date().toISOString(),
    });

    return merged;
  }

  // -----------------------------------------------------------
  // Trips Monitor
  // -----------------------------------------------------------
  public static getAllTrips() {
    return Array.from(localStore.trips.values()).map((t: any) => {
      const customer = t.customer_id ? localStore.users.get(t.customer_id) : null;
      const driver = t.driver_id ? localStore.users.get(t.driver_id) : null;
      return {
        ...t,
        customer_name: customer?.full_name || 'Safari Passenger',
        customer_phone: customer?.phone || '+256 700 000000',
        driver_name: driver?.full_name || (t.driver_id ? 'Assigned Driver' : 'Pending Dispatch'),
        driver_phone: driver?.phone || '',
      };
    });
  }

  // -----------------------------------------------------------
  // Deliveries Monitor
  // -----------------------------------------------------------
  public static getAllDeliveries() {
    return Array.from(localStore.deliveries.values()).map((d: any) => {
      const customer = d.customer_id ? localStore.users.get(d.customer_id) : null;
      const courier = d.courier_id ? localStore.users.get(d.courier_id) : null;
      return {
        ...d,
        customer_name: customer?.full_name || 'Sender',
        courier_name: courier?.full_name || 'Boda Courier',
      };
    });
  }

  // -----------------------------------------------------------
  // Drivers & Fleet Management
  // -----------------------------------------------------------
  public static getDriversFleet() {
    return Array.from(localStore.drivers.values()).map((d: any) => {
      const user = localStore.users.get(d.id);
      const vehicle = d.vehicle_id ? localStore.vehicles.get(d.vehicle_id) : null;
      return {
        ...d,
        full_name: user?.full_name || 'Driver Partner',
        phone: user?.phone || '',
        email: user?.email || '',
        avatar_url: user?.avatar_url || '',
        rating: user?.rating || 4.95,
        vehicle_make: vehicle?.make || 'Toyota',
        vehicle_model: vehicle?.model || 'Sedan',
        registration_plate: vehicle?.registration_plate || 'UBM 000X',
        vehicle_tier: vehicle?.tier || 'comfort',
        color: vehicle?.color || 'Silver',
      };
    });
  }

  // -----------------------------------------------------------
  // Users List
  // -----------------------------------------------------------
  public static getAllUsers() {
    return Array.from(localStore.users.values()).map((u: any) => ({
      id: u.id,
      full_name: u.full_name,
      phone: u.phone,
      email: u.email,
      role: u.role,
      rating: u.rating,
      total_trips: u.total_trips,
      wallet_balance_ugx: u.wallet_balance_ugx || 0,
      is_verified: u.is_verified,
      created_at: u.created_at,
    }));
  }
}
