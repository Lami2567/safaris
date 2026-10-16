import { Pool, QueryResult } from 'pg';
import { ENV } from './env';
import fs from 'fs';
import path from 'path';

// Memory Store Tables for resilient local development and ultra-fast caching
export const localStore = {
  users: new Map<string, any>(),
  drivers: new Map<string, any>(),
  vehicles: new Map<string, any>(),
  tour_guides: new Map<string, any>(),
  destinations: new Map<string, any>(),
  tour_packages: new Map<string, any>(),
  trips: new Map<string, any>(),
  tour_bookings: new Map<string, any>(),
  deliveries: new Map<string, any>(),
  payments: new Map<string, any>(),
  messages: new Map<string, any>(),
  notifications: new Map<string, any>(),
  app_config: new Map<string, any>(),
  location_sessions: new Map<string, any>(),
  location_points: new Map<string, any>(),
  tour_legs: new Map<string, any>(),
  admin_audit_logs: new Map<string, any>(),
  career_applications: new Map<string, any>(),
  pricing_audit_logs: new Map<string, any>(),
};

function resolveCandidatePaths(fileName: string): string[] {
  return [
    path.resolve(__dirname, `../database/${fileName}`),
    path.resolve(process.cwd(), `src/database/${fileName}`),
    path.resolve(process.cwd(), `backend/src/database/${fileName}`),
    path.resolve(process.cwd(), fileName),
  ];
}

const PERSISTENT_USERS_FILES = resolveCandidatePaths('persistent_users.json');
const PERSISTENT_DRIVERS_FILES = resolveCandidatePaths('persistent_drivers.json');
const PERSISTENT_GUIDES_FILES = resolveCandidatePaths('persistent_tour_guides.json');
const PERSISTENT_APPLICATIONS_FILES = resolveCandidatePaths('persistent_career_applications.json');
const PERSISTENT_TRIPS_FILES = resolveCandidatePaths('persistent_trips.json');
const PERSISTENT_PAYMENTS_FILES = resolveCandidatePaths('persistent_payments.json');
const PERSISTENT_BOOKINGS_FILES = resolveCandidatePaths('persistent_bookings.json');
const PERSISTENT_DELIVERIES_FILES = resolveCandidatePaths('persistent_deliveries.json');
const PERSISTENT_PRICING_AUDIT_FILES = resolveCandidatePaths('persistent_pricing_audit.json');

class DatabaseManager {
  private pool: Pool | null = null;
  public isPostgresConnected = false;
  private isSchemaInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.init();
  }

  public async waitForReady(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  public async init(): Promise<void> {
    try {
      this.pool = new Pool({
        connectionString: ENV.DATABASE_URL,
        connectionTimeoutMillis: 5000,
        max: 20,
      });

      const client = await this.pool.connect();
      client.release();
      this.isPostgresConnected = true;
      console.log('✅ [Database] Connected successfully to PostgreSQL instance.');

      // 1. Ensure Schema DDL exists in PostgreSQL & remove any legacy mock seed records
      await this.ensureSchema();

      // 2. Load all entities authoritatively from PostgreSQL into memory
      await this.loadAllFromPostgres();
    } catch (err) {
      this.isPostgresConnected = false;
      this.loadAllFromDisk();
      console.log('⚡ [Database] PostgreSQL not detected locally. Initialized in-memory data store with disk persistence.');
    }
  }

  public async ensureSchema(): Promise<void> {
    if (this.isSchemaInitialized || !this.isPostgresConnected || !this.pool) return;
    try {
      const candidateSchemaPaths = [
        path.resolve(__dirname, '../database/schema.sql'),
        path.resolve(__dirname, 'schema.sql'),
        path.resolve(process.cwd(), 'src/database/schema.sql'),
        path.resolve(process.cwd(), 'backend/src/database/schema.sql'),
        path.resolve(process.cwd(), 'dist/database/schema.sql'),
      ];
      const schemaPath = candidateSchemaPaths.find(p => fs.existsSync(p));
      if (schemaPath) {
        const sql = fs.readFileSync(schemaPath, 'utf-8');
        await this.pool.query(sql);
      }

      // Clean up legacy mock/seed accounts so only genuine registered accounts remain
      await this.pool.query(`
        DELETE FROM drivers WHERE id IN ('driver-001', 'usr_drv_001', 'usr_drv_002');
        DELETE FROM vehicles WHERE id IN ('veh-001', 'veh_001', 'veh_002') OR driver_id IN ('driver-001', 'usr_drv_001', 'usr_drv_002');
        DELETE FROM tour_guides WHERE id IN ('usr_gd_001');
        DELETE FROM users WHERE id IN ('driver-001', 'usr_ug_001', 'usr_drv_001', 'usr_drv_002', 'usr_gd_001');
      `);

      this.isSchemaInitialized = true;
      console.log('✅ [Database] Database schema verified and synchronized.');
    } catch (err) {
      console.warn('⚠️ [Database] Schema synchronization notice (non-fatal):', err);
    }
  }

  private loadTableFromDisk(fileCandidates: string[], targetMap: Map<string, any>, label: string) {
    for (const f of fileCandidates) {
      try {
        if (fs.existsSync(f)) {
          const raw = fs.readFileSync(f, 'utf-8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item && item.id && !targetMap.has(item.id)) {
                targetMap.set(item.id, item);
              }
            }
            if (parsed.length > 0) {
              console.log(`💾 [Database] Loaded ${parsed.length} persistent ${label} from disk storage.`);
            }
            break;
          }
        }
      } catch (_) {}
    }
  }

  private saveTableToDisk(fileCandidates: string[], targetMap: Map<string, any>) {
    const list = Array.from(targetMap.values());
    for (const f of fileCandidates) {
      try {
        const dir = path.dirname(f);
        if (fs.existsSync(dir)) {
          fs.writeFileSync(f, JSON.stringify(list, null, 2), 'utf-8');
        }
      } catch (_) {}
    }
  }

  public loadAllFromDisk(): void {
    this.loadTableFromDisk(PERSISTENT_USERS_FILES, localStore.users, 'users');
    this.loadTableFromDisk(PERSISTENT_DRIVERS_FILES, localStore.drivers, 'drivers');
    this.loadTableFromDisk(PERSISTENT_GUIDES_FILES, localStore.tour_guides, 'tour_guides');
    this.loadTableFromDisk(PERSISTENT_APPLICATIONS_FILES, localStore.career_applications, 'career_applications');
    this.loadTableFromDisk(PERSISTENT_TRIPS_FILES, localStore.trips, 'trips');
    this.loadTableFromDisk(PERSISTENT_PAYMENTS_FILES, localStore.payments, 'payments');
    this.loadTableFromDisk(PERSISTENT_BOOKINGS_FILES, localStore.tour_bookings, 'tour_bookings');
    this.loadTableFromDisk(PERSISTENT_DELIVERIES_FILES, localStore.deliveries, 'deliveries');
    this.loadTableFromDisk(PERSISTENT_PRICING_AUDIT_FILES, localStore.pricing_audit_logs, 'pricing_audit_logs');
  }

  public saveAllToDisk(): void {
    this.saveTableToDisk(PERSISTENT_USERS_FILES, localStore.users);
    this.saveTableToDisk(PERSISTENT_DRIVERS_FILES, localStore.drivers);
    this.saveTableToDisk(PERSISTENT_GUIDES_FILES, localStore.tour_guides);
    this.saveTableToDisk(PERSISTENT_APPLICATIONS_FILES, localStore.career_applications);
    this.saveTableToDisk(PERSISTENT_TRIPS_FILES, localStore.trips);
    this.saveTableToDisk(PERSISTENT_PAYMENTS_FILES, localStore.payments);
    this.saveTableToDisk(PERSISTENT_BOOKINGS_FILES, localStore.tour_bookings);
    this.saveTableToDisk(PERSISTENT_DELIVERIES_FILES, localStore.deliveries);
    this.saveTableToDisk(PERSISTENT_PRICING_AUDIT_FILES, localStore.pricing_audit_logs);
  }

  public async loadAllFromPostgres(): Promise<void> {
    if (!this.isPostgresConnected || !this.pool) return;
    try {
      // Clear in-memory caches so PostgreSQL is the sole authoritative source
      localStore.users.clear();
      localStore.drivers.clear();
      localStore.vehicles.clear();
      localStore.tour_guides.clear();
      localStore.career_applications.clear();
      localStore.trips.clear();
      localStore.deliveries.clear();
      localStore.tour_bookings.clear();
      localStore.payments.clear();

      // 1. Users
      const userRes = await this.pool.query('SELECT * FROM users ORDER BY created_at ASC');
      if (userRes?.rows?.length > 0) {
        for (const row of userRes.rows) {
          localStore.users.set(row.id, {
            id: row.id,
            full_name: row.full_name || '',
            phone: row.phone || '',
            email: row.email || `${row.id}@safaris.ug`,
            password_hash: row.password_hash,
            role: row.role || 'customer',
            avatar_url: row.avatar_url || '',
            rating: parseFloat(row.rating || '5.0'),
            total_trips: parseInt(row.total_trips || '0', 10),
            wallet_balance_ugx: parseFloat(row.wallet_balance_ugx || '0'),
            is_verified: row.is_verified === true,
            approval_status: row.approval_status || 'APPROVED',
            application_id: row.application_id || null,
            password_changed_at: row.password_changed_at ? new Date(row.password_changed_at).toISOString() : new Date().toISOString(),
            created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          });
        }
      }

      // 2. Drivers
      const drvRes = await this.pool.query('SELECT * FROM drivers');
      if (drvRes?.rows?.length > 0) {
        for (const row of drvRes.rows) {
          localStore.drivers.set(row.id, {
            id: row.id,
            vehicle_id: row.vehicle_id,
            is_online: row.is_online === true,
            is_available: row.is_available === true,
            is_approved: row.is_approved === true,
            approval_status: row.approval_status || 'PENDING_APPROVAL',
            current_lat: parseFloat(row.current_lat || '0.3136'),
            current_lng: parseFloat(row.current_lng || '32.5811'),
            heading: parseFloat(row.heading || '0.0'),
            speed: parseFloat(row.speed || '0.0'),
            battery_level: row.battery_level ? parseFloat(row.battery_level) : undefined,
            license_number: row.license_number,
            license_expiry: row.license_expiry,
            national_id: row.national_id,
            driving_permit_number: row.driving_permit_number,
            years_of_experience: row.years_of_experience || 0,
            acceptance_rate: parseFloat(row.acceptance_rate || '98.0'),
            today_earnings_ugx: parseFloat(row.today_earnings_ugx || '0'),
            application_date: row.application_date,
            approved_by: row.approved_by,
            approved_at: row.approved_at,
            rejection_reason: row.rejection_reason,
            updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
          });
        }
      }

      // 3. Vehicles
      const vehRes = await this.pool.query('SELECT * FROM vehicles');
      if (vehRes?.rows?.length > 0) {
        for (const row of vehRes.rows) {
          localStore.vehicles.set(row.id, row);
        }
      }

      // 4. Tour Guides (Only approved guides)
      const tgRes = await this.pool.query('SELECT * FROM tour_guides WHERE is_approved = true AND approval_status = \'APPROVED\'');
      if (tgRes?.rows?.length > 0) {
        for (const row of tgRes.rows) {
          localStore.tour_guides.set(row.id, row);
        }
      }

      // 5. Career Applications
      const appRes = await this.pool.query('SELECT * FROM career_applications ORDER BY created_at DESC');
      if (appRes?.rows?.length > 0) {
        for (const row of appRes.rows) {
          localStore.career_applications.set(row.id, row);
        }
      }

      // 6. Trips
      const tripRes = await this.pool.query('SELECT * FROM trips ORDER BY created_at DESC LIMIT 500');
      if (tripRes?.rows?.length > 0) {
        for (const row of tripRes.rows) {
          localStore.trips.set(row.id, row);
        }
      }

      // 7. Deliveries
      const delRes = await this.pool.query('SELECT * FROM deliveries ORDER BY created_at DESC LIMIT 500');
      if (delRes?.rows?.length > 0) {
        for (const row of delRes.rows) {
          localStore.deliveries.set(row.id, row);
        }
      }

      // 8. Tour Bookings
      const bkRes = await this.pool.query('SELECT * FROM tour_bookings ORDER BY created_at DESC LIMIT 500');
      if (bkRes?.rows?.length > 0) {
        for (const row of bkRes.rows) {
          localStore.tour_bookings.set(row.id, row);
        }
      }

      // 9. Payments
      const payRes = await this.pool.query('SELECT * FROM payments ORDER BY created_at DESC LIMIT 500');
      if (payRes?.rows?.length > 0) {
        for (const row of payRes.rows) {
          localStore.payments.set(row.id, {
            id: row.id,
            transaction_id: row.reference,
            user_id: row.user_id,
            reference_type: row.trip_id ? 'TRIP' : (row.booking_id ? 'TOUR' : (row.delivery_id ? 'DELIVERY' : 'WALLET')),
            reference_id: row.trip_id || row.booking_id || row.delivery_id || row.user_id,
            amount_ugx: parseFloat(row.amount_ugx || '0'),
            currency: row.currency || 'UGX',
            payment_method: row.payment_method,
            phone: '',
            dpo_trans_token: row.dpo_trans_token || '',
            dpo_trans_ref: row.dpo_trans_ref || row.reference,
            payment_url: row.payment_url || '',
            status: row.status === 'COMPLETED' ? 'SUCCESSFUL' : (row.status === 'FAILED' ? 'FAILED' : 'PENDING'),
            failure_reason: row.failure_reason,
            verified_at: row.verified_at,
            created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
          });
        }
      }

      this.saveAllToDisk();
      console.log('📦 [Database] All business tables synchronized from PostgreSQL to memory & disk.');
    } catch (err) {
      console.warn('[Database] Notice: Table load error:', err);
    }
  }

  public loadUsersFromDisk(): void {
    this.loadTableFromDisk(PERSISTENT_USERS_FILES, localStore.users, 'users');
  }

  public saveUsersToDisk(): void {
    this.saveTableToDisk(PERSISTENT_USERS_FILES, localStore.users);
  }

  public async persistUser(user: any): Promise<void> {
    // 1. Update in-memory cache
    localStore.users.set(user.id, user);

    // 2. Persist to PostgreSQL if connected
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO users (
             id, full_name, phone, email, password_hash, role, avatar_url,
             rating, total_trips, wallet_balance_ugx, is_verified, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             full_name = EXCLUDED.full_name,
             phone = EXCLUDED.phone,
             email = EXCLUDED.email,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             avatar_url = EXCLUDED.avatar_url,
             rating = EXCLUDED.rating,
             total_trips = EXCLUDED.total_trips,
             wallet_balance_ugx = EXCLUDED.wallet_balance_ugx,
             is_verified = EXCLUDED.is_verified,
             updated_at = CURRENT_TIMESTAMP`,
          [
            user.id,
            user.full_name,
            user.phone,
            user.email,
            user.password_hash,
            user.role || 'customer',
            user.avatar_url || '',
            user.rating || 5.0,
            user.total_trips || 0,
            user.wallet_balance_ugx || 0,
            user.is_verified === true,
            user.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.error('[Database Error] Failed to persist user to PostgreSQL:', err);
      }
    }

    // 3. Persist to disk for offline resilience
    this.saveUsersToDisk();
  }

  public async persistDriver(driver: any): Promise<void> {
    localStore.drivers.set(driver.id, driver);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO drivers (
             id, vehicle_id, is_online, is_available, is_approved, approval_status,
             current_lat, current_lng, heading, speed, battery_level, license_number,
             license_expiry, national_id, driving_permit_number, permit_expiry,
             years_of_experience, acceptance_rate, today_earnings_ugx, application_date,
             approved_by, approved_at, rejection_reason, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
             $17, $18, $19, $20, $21, $22, $23, CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
             vehicle_id = EXCLUDED.vehicle_id,
             is_online = EXCLUDED.is_online,
             is_available = EXCLUDED.is_available,
             is_approved = EXCLUDED.is_approved,
             approval_status = EXCLUDED.approval_status,
             current_lat = EXCLUDED.current_lat,
             current_lng = EXCLUDED.current_lng,
             heading = EXCLUDED.heading,
             speed = EXCLUDED.speed,
             battery_level = EXCLUDED.battery_level,
             license_number = EXCLUDED.license_number,
             license_expiry = EXCLUDED.license_expiry,
             national_id = EXCLUDED.national_id,
             driving_permit_number = EXCLUDED.driving_permit_number,
             permit_expiry = EXCLUDED.permit_expiry,
             years_of_experience = EXCLUDED.years_of_experience,
             acceptance_rate = EXCLUDED.acceptance_rate,
             today_earnings_ugx = EXCLUDED.today_earnings_ugx,
             approved_by = EXCLUDED.approved_by,
             approved_at = EXCLUDED.approved_at,
             rejection_reason = EXCLUDED.rejection_reason,
             updated_at = CURRENT_TIMESTAMP`,
          [
            driver.id,
            driver.vehicle_id || null,
            driver.is_online === true,
            driver.is_available === true,
            driver.is_approved === true,
            driver.approval_status || 'PENDING_APPROVAL',
            driver.current_lat ?? 0.3136,
            driver.current_lng ?? 32.5811,
            driver.heading ?? 0.0,
            driver.speed ?? 0.0,
            driver.battery_level ?? null,
            driver.license_number || '',
            driver.license_expiry || null,
            driver.national_id || '',
            driver.driving_permit_number || '',
            driver.permit_expiry || null,
            driver.years_of_experience || 0,
            driver.acceptance_rate ?? 98.0,
            driver.today_earnings_ugx ?? 0.0,
            driver.application_date || new Date().toISOString(),
            driver.approved_by || null,
            driver.approved_at || null,
            driver.rejection_reason || null,
          ]
        );
      } catch (err) {
        console.error('[Database Error] Failed to persist driver to PostgreSQL:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_DRIVERS_FILES, localStore.drivers);
  }

  public async persistTourGuide(guide: any): Promise<void> {
    localStore.tour_guides.set(guide.id, guide);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO tour_guides (
             id, title, bio, languages, specialties, daily_rate_ugx, is_uwa_certified,
             is_available, is_approved, approval_status, application_id, national_id,
             uwa_license_number, approved_by, approved_at, rejection_reason,
             expeditions_count, avatar_url, full_name, rating, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
             $17, $18, $19, $20, CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             bio = EXCLUDED.bio,
             languages = EXCLUDED.languages,
             specialties = EXCLUDED.specialties,
             daily_rate_ugx = EXCLUDED.daily_rate_ugx,
             is_uwa_certified = EXCLUDED.is_uwa_certified,
             is_available = EXCLUDED.is_available,
             is_approved = EXCLUDED.is_approved,
             approval_status = EXCLUDED.approval_status,
             application_id = EXCLUDED.application_id,
             national_id = EXCLUDED.national_id,
             uwa_license_number = EXCLUDED.uwa_license_number,
             approved_by = EXCLUDED.approved_by,
             approved_at = EXCLUDED.approved_at,
             rejection_reason = EXCLUDED.rejection_reason,
             expeditions_count = EXCLUDED.expeditions_count,
             avatar_url = EXCLUDED.avatar_url,
             full_name = EXCLUDED.full_name,
             rating = EXCLUDED.rating,
             updated_at = CURRENT_TIMESTAMP`,
          [
            guide.id,
            guide.title || 'Uganda Wildlife Guide',
            guide.bio || '',
            guide.languages || ['English'],
            guide.specialties || ['Uganda Safaris'],
            guide.daily_rate_ugx ?? 150000,
            guide.is_uwa_certified !== false,
            guide.is_available === true,
            guide.is_approved === true,
            guide.approval_status || 'PENDING_APPROVAL',
            guide.application_id || null,
            guide.national_id || '',
            guide.uwa_license_number || '',
            guide.approved_by || null,
            guide.approved_at || null,
            guide.rejection_reason || null,
            guide.expeditions_count || 0,
            guide.avatar_url || '',
            guide.full_name || 'Safari Guide',
            guide.rating || 4.95,
          ]
        );
      } catch (err) {
        console.error('[Database Error] Failed to persist tour guide to PostgreSQL:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_GUIDES_FILES, localStore.tour_guides);
  }

  public async persistCareerApplication(app: any): Promise<void> {
    localStore.career_applications.set(app.id, app);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO career_applications (
             id, applicant_type, user_id, full_name, email, phone, national_id,
             license_number, experience_years, vehicle_make, vehicle_model,
             vehicle_plate, vehicle_tier, languages, specialties, documents,
             status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             $16, $17, $18, $19, $20, $21, CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             rejection_reason = EXCLUDED.rejection_reason,
             reviewed_by = EXCLUDED.reviewed_by,
             reviewed_at = EXCLUDED.reviewed_at,
             updated_at = CURRENT_TIMESTAMP`,
          [
            app.id,
            app.applicant_type,
            app.user_id || null,
            app.full_name,
            app.email,
            app.phone,
            app.national_id || '',
            app.license_number || '',
            app.experience_years || 0,
            app.vehicle_make || '',
            app.vehicle_model || '',
            app.vehicle_plate || '',
            app.vehicle_tier || '',
            app.languages || ['English'],
            app.specialties || ['Uganda Safaris'],
            JSON.stringify(app.documents || {}),
            app.status || 'PENDING_APPROVAL',
            app.rejection_reason || null,
            app.reviewed_by || null,
            app.reviewed_at || null,
            app.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.error('[Database Error] Failed to persist career application to PostgreSQL:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_APPLICATIONS_FILES, localStore.career_applications);
  }

  public async persistPricingAudit(audit: any): Promise<void> {
    localStore.pricing_audit_logs.set(audit.id, audit);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO pricing_audit_logs (
             id, admin_id, service_category, old_pricing, new_pricing, ip_address, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          [
            audit.id,
            audit.admin_id,
            audit.service_category,
            JSON.stringify(audit.old_pricing),
            JSON.stringify(audit.new_pricing),
            audit.ip_address || '',
          ]
        );
      } catch (err) {
        console.error('[Database Error] Failed to persist pricing audit log:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_PRICING_AUDIT_FILES, localStore.pricing_audit_logs);
  }

  public async query(text: string, params?: any[]): Promise<QueryResult<any> | any> {
    if (this.isPostgresConnected && this.pool) {
      try {
        return await this.pool.query(text, params);
      } catch (err) {
        console.error('[Database Error]', err);
        throw err;
      }
    }
    return { rows: [], rowCount: 0 };
  }

  public async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export const db = new DatabaseManager();
