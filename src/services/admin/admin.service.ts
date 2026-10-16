import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { localStore, db } from '../../config/database';
import { ENV } from '../../config/env';

const PERSISTENT_CONFIG_FILE = path.resolve(__dirname, '../../database/persistent_config.json');

export interface VehiclePricingItem {
  baseFare: number;
  perKm: number;
  perMin?: number;
  minFare?: number;
}

export interface PricingConfig {
  boda: VehiclePricingItem;
  go: VehiclePricingItem;
  economy: VehiclePricingItem;
  comfort: VehiclePricingItem;
  safari4x4: VehiclePricingItem;
  safari: VehiclePricingItem;
  tour_van: VehiclePricingItem;
  delivery: VehiclePricingItem;
}

const DEFAULT_PRICING: PricingConfig = {
  boda: { baseFare: 3000, perKm: 1200, minFare: 3000 },
  go: { baseFare: 6000, perKm: 2200, minFare: 6000 },
  economy: { baseFare: 6000, perKm: 2200, minFare: 6000 },
  comfort: { baseFare: 10000, perKm: 3200, minFare: 10000 },
  safari4x4: { baseFare: 50000, perKm: 6500, minFare: 50000 },
  safari: { baseFare: 50000, perKm: 6500, minFare: 50000 },
  tour_van: { baseFare: 65000, perKm: 7500, minFare: 65000 },
  delivery: { baseFare: 3500, perKm: 1200, minFare: 3500 },
};

export class AdminService {
  public static getDashboardStats() {
    const approvedDrivers = Array.from(localStore.drivers.values()).filter(
      (d: any) => d.is_approved === true && d.approval_status === 'APPROVED'
    );
    const approvedGuides = Array.from(localStore.tour_guides.values()).filter(
      (g: any) => g.is_approved === true && g.approval_status === 'APPROVED'
    );
    const registeredUsers = Array.from(localStore.users.values()).filter(
      (u: any) => !['driver', 'tour_guide'].includes(u.role) || u.approval_status === 'APPROVED'
    );

    const totalUsers = registeredUsers.length;
    const totalDrivers = approvedDrivers.length;
    const totalGuides = approvedGuides.length;
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

    const onlineDriversCount = approvedDrivers.filter(
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
    if (saved && saved.value) {
      return saved.value;
    }

    // Try reading from persistent config file if available
    try {
      if (fs.existsSync(PERSISTENT_CONFIG_FILE)) {
        const raw = fs.readFileSync(PERSISTENT_CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.pricing_matrix) {
          localStore.app_config.set('pricing_matrix', {
            key: 'pricing_matrix',
            value: parsed.pricing_matrix,
            updated_at: new Date().toISOString(),
          });
          return parsed.pricing_matrix;
        }
      }
    } catch (_) {}

    return DEFAULT_PRICING;
  }

  public static async updatePricing(pricing: any): Promise<PricingConfig> {
    const current = this.getPricing();

    const normalizeItem = (item: any, fallback: VehiclePricingItem): VehiclePricingItem => {
      if (!item) return fallback;
      const baseFare = Number(item.baseFare ?? item.base ?? fallback.baseFare);
      const perKm = Number(item.perKmRate ?? item.perKm ?? fallback.perKm);
      const perMin = item.perMinuteRate !== undefined ? Number(item.perMinuteRate) : (item.perMin !== undefined ? Number(item.perMin) : fallback.perMin);
      const minFare = item.minimumFare !== undefined ? Number(item.minimumFare) : (item.minFare !== undefined ? Number(item.minFare) : fallback.minFare);
      return {
        baseFare,
        perKm,
        ...(perMin !== undefined ? { perMin } : {}),
        ...(minFare !== undefined ? { minFare } : {}),
      };
    };

    const bodaItem = normalizeItem(pricing.boda, current.boda);
    const economyChoice = normalizeItem(pricing.economy || pricing.go, current.economy || current.go);
    const comfortItem = normalizeItem(pricing.comfort, current.comfort);
    const safariChoice = normalizeItem(pricing.safari_4x4 || pricing.safari4x4 || pricing.safari, current.safari4x4 || current.safari);
    const tourVanItem = normalizeItem(pricing.tour_van || pricing.tourVan, current.tour_van);
    const deliveryItem = normalizeItem(pricing.delivery, current.delivery);

    const merged: PricingConfig = {
      boda: bodaItem,
      go: economyChoice,
      economy: economyChoice,
      comfort: comfortItem,
      safari4x4: safariChoice,
      safari: safariChoice,
      tour_van: tourVanItem,
      delivery: deliveryItem,
    };

    localStore.app_config.set('pricing_matrix', {
      key: 'pricing_matrix',
      value: merged,
      updated_at: new Date().toISOString(),
    });

    // 1. Persist directly in PostgreSQL if connected
    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO app_config (key, value, updated_at) 
           VALUES ('pricing_matrix', $1, CURRENT_TIMESTAMP) 
           ON CONFLICT (key) 
           DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [JSON.stringify(merged)]
        );
      } catch (err) {
        console.error('[AdminService] PostgreSQL pricing sync error:', err);
      }
    }

    // 2. Persist to disk JSON file for restart durability
    try {
      let dump: Record<string, any> = {};
      if (fs.existsSync(PERSISTENT_CONFIG_FILE)) {
        try {
          dump = JSON.parse(fs.readFileSync(PERSISTENT_CONFIG_FILE, 'utf-8'));
        } catch (_) {}
      }
      dump.pricing_matrix = merged;
      const dir = path.dirname(PERSISTENT_CONFIG_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(PERSISTENT_CONFIG_FILE, JSON.stringify(dump, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[AdminService] Could not write persistent pricing_matrix', e);
    }

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
  // Drivers & Fleet Management (Only Approved Drivers)
  // -----------------------------------------------------------
  public static async getDriversFleet() {
    if (db.isPostgresConnected) {
      try {
        const res = await db.query(`
          SELECT d.*,
                 u.full_name, u.phone, u.email, u.avatar_url, u.rating,
                 v.make as vehicle_make, v.model as vehicle_model,
                 v.registration_plate, v.tier as vehicle_tier, v.color
          FROM drivers d
          JOIN users u ON d.id = u.id
          LEFT JOIN vehicles v ON d.vehicle_id = v.id
          WHERE d.is_approved = true AND d.approval_status = 'APPROVED'
          ORDER BY d.updated_at DESC
        `);
        if (res && Array.isArray(res.rows)) {
          return res.rows.map((row: any) => ({
            ...row,
            name: row.full_name || 'Driver Partner',
            full_name: row.full_name || 'Driver Partner',
            phoneNumber: row.phone || '',
            phone: row.phone || '',
            email: row.email || '',
            rating: parseFloat(row.rating || '5.0'),
            vehicleModel: `${row.vehicle_make || 'Toyota'} ${row.vehicle_model || 'Safari'}`,
            vehicle_make: row.vehicle_make || 'Toyota',
            vehicle_model: row.vehicle_model || 'Safari',
            licensePlate: row.registration_plate || '',
            registration_plate: row.registration_plate || '',
            isOnline: row.is_online === true,
            is_online: row.is_online === true,
          }));
        }
      } catch (err) {
        console.warn('[AdminService.getDriversFleet] PostgreSQL query error:', err);
      }
    }

    return Array.from(localStore.drivers.values())
      .filter((d: any) => d.is_approved === true && d.approval_status === 'APPROVED')
      .map((d: any) => {
        const user = localStore.users.get(d.id);
        const vehicle = d.vehicle_id ? localStore.vehicles.get(d.vehicle_id) : null;
        return {
          ...d,
          name: user?.full_name || 'Driver Partner',
          full_name: user?.full_name || 'Driver Partner',
          phoneNumber: user?.phone || '',
          phone: user?.phone || '',
          email: user?.email || '',
          avatar_url: user?.avatar_url || '',
          rating: user?.rating || 4.95,
          vehicleModel: `${vehicle?.make || 'Toyota'} ${vehicle?.model || 'Sedan'}`,
          vehicle_make: vehicle?.make || 'Toyota',
          vehicle_model: vehicle?.model || 'Sedan',
          licensePlate: vehicle?.registration_plate || '',
          registration_plate: vehicle?.registration_plate || '',
          vehicle_tier: vehicle?.tier || 'comfort',
          color: vehicle?.color || 'Silver',
          isOnline: d.is_online === true,
        };
      });
  }

  // -----------------------------------------------------------
  // Users List (Permanent PostgreSQL Registered Accounts)
  // -----------------------------------------------------------
  public static async getAllUsers() {
    if (db.isPostgresConnected) {
      try {
        const res = await db.query(`
          SELECT id, full_name, phone, email, role, avatar_url, rating,
                 total_trips, wallet_balance_ugx, is_verified, approval_status, created_at
          FROM users
          WHERE (role NOT IN ('driver', 'tour_guide') OR approval_status = 'APPROVED')
            AND id NOT IN ('driver-001', 'usr_ug_001', 'usr_drv_001', 'usr_drv_002', 'usr_gd_001')
          ORDER BY created_at DESC
        `);
        if (res && Array.isArray(res.rows)) {
          for (const row of res.rows) {
            const existing = localStore.users.get(row.id) || {};
            localStore.users.set(row.id, {
              ...existing,
              id: row.id,
              full_name: row.full_name || '',
              phone: row.phone || '',
              email: row.email || '',
              role: row.role || 'customer',
              avatar_url: row.avatar_url || '',
              rating: parseFloat(row.rating || '5.0'),
              total_trips: parseInt(row.total_trips || '0', 10),
              wallet_balance_ugx: parseFloat(row.wallet_balance_ugx || '0'),
              is_verified: row.is_verified === true,
              approval_status: row.approval_status || 'APPROVED',
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            });
          }
          return res.rows.map((u: any) => ({
            id: u.id,
            full_name: u.full_name,
            phone: u.phone,
            email: u.email,
            role: u.role,
            rating: parseFloat(u.rating || '5.0'),
            total_trips: parseInt(u.total_trips || '0', 10),
            wallet_balance_ugx: parseFloat(u.wallet_balance_ugx || '0'),
            is_verified: u.is_verified === true,
            approval_status: u.approval_status || 'APPROVED',
            created_at: u.created_at ? new Date(u.created_at).toISOString() : new Date().toISOString(),
          }));
        }
      } catch (err) {
        console.warn('[AdminService.getAllUsers] PostgreSQL query error:', err);
      }
    }

    return Array.from(localStore.users.values())
      .filter((u: any) => {
        if (['driver-001', 'usr_ug_001', 'usr_drv_001', 'usr_drv_002', 'usr_gd_001'].includes(u.id)) {
          return false;
        }
        if (u.role === 'driver' || u.role === 'tour_guide') {
          return u.approval_status === 'APPROVED';
        }
        return true;
      })
      .map((u: any) => ({
        id: u.id,
        full_name: u.full_name,
        phone: u.phone,
        email: u.email,
        role: u.role,
        rating: u.rating,
        total_trips: u.total_trips,
        wallet_balance_ugx: u.wallet_balance_ugx || 0,
        is_verified: u.is_verified,
        approval_status: u.approval_status || 'APPROVED',
        created_at: u.created_at,
      }));
  }

  // -----------------------------------------------------------
  // Admin Password Management
  // -----------------------------------------------------------
  public static async changePassword(adminId: string, currentPassword: string, newPassword: string, ipAddress?: string) {
    if (!currentPassword) throw new Error('Current password is required.');
    if (!newPassword || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }

    let user = localStore.users.get(adminId);
    if (!user && db.isPostgresConnected) {
      try {
        const res = await db.query('SELECT * FROM users WHERE id = $1', [adminId]);
        if (res?.rows?.length > 0) {
          user = res.rows[0];
          localStore.users.set(adminId, user);
        }
      } catch (_) {}
    }

    if (!user) {
      // Find default admin user
      for (const u of localStore.users.values()) {
        if (u.role === 'admin') {
          user = u;
          break;
        }
      }
    }

    if (!user) throw new Error('Admin user account not found.');

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new Error('Current password is incorrect.');
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    user.password_hash = newHash;
    user.password_changed_at = new Date().toISOString();
    user.updated_at = new Date().toISOString();

    await db.persistUser(user);

    // Record in admin audit logs
    const auditId = `aud_${Date.now()}_pwd`;
    const auditRecord = {
      id: auditId,
      admin_id: user.id,
      action: 'ADMIN_CHANGE_PASSWORD',
      resource_type: 'USER',
      resource_id: user.id,
      details: {
        adminId: user.id,
        email: user.email,
        timestamp: new Date().toISOString(),
      },
      ip_address: ipAddress || '127.0.0.1',
      created_at: new Date().toISOString(),
    };
    localStore.admin_audit_logs.set(auditId, auditRecord);
    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO admin_audit_logs (id, admin_id, action, resource_type, resource_id, details, ip_address, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
          [auditRecord.id, auditRecord.admin_id, auditRecord.action, auditRecord.resource_type, auditRecord.resource_id, JSON.stringify(auditRecord.details), auditRecord.ip_address]
        );
      } catch (_) {}
    }

    return {
      success: true,
      message: 'Admin password successfully updated.',
      passwordChangedAt: user.password_changed_at,
    };
  }
}
