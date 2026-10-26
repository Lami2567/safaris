import { Pool, QueryResult } from 'pg';
import { ENV } from './env';
import { resolveDataFilePaths } from './paths';
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
  wallet_transactions: new Map<string, any>(),
  refund_policies: new Map<string, any>(),
  refunds: new Map<string, any>(),
  platform_earnings: new Map<string, any>(),
  financial_adjustments: new Map<string, any>(),
  ledger_accounts: new Map<string, any>(),
  ledger_transactions: new Map<string, any>(),
  ledger_entries: new Map<string, any>(),
  account_balance_projections: new Map<string, any>(),
  wallets: new Map<string, any>(),
  wallet_holds: new Map<string, any>(),
  payment_intents: new Map<string, any>(),
  payment_attempts: new Map<string, any>(),
  payment_provider_events: new Map<string, any>(),
  payment_verifications: new Map<string, any>(),
  payment_settlements: new Map<string, any>(),
  financial_policy_versions: new Map<string, any>(),
  refund_attempts: new Map<string, any>(),
  payout_destinations: new Map<string, any>(),
  payout_requests: new Map<string, any>(),
  payout_attempts: new Map<string, any>(),
  commission_records: new Map<string, any>(),
  financial_outbox: new Map<string, any>(),
  reconciliation_runs: new Map<string, any>(),
  reconciliation_discrepancies: new Map<string, any>(),
  financial_audit_logs: new Map<string, any>(),
  catalogue_vehicles: new Map<string, any>(),
  service_pricing_rules: new Map<string, any>(),
  price_quotations: new Map<string, any>(),
  destination_media: new Map<string, any>(),
};

function resolveCandidatePaths(fileName: string): string[] {
  return resolveDataFilePaths(fileName);
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
const PERSISTENT_WALLET_TX_FILES = resolveCandidatePaths('persistent_wallet_transactions.json');
const PERSISTENT_REFUND_POLICIES_FILES = resolveCandidatePaths('persistent_refund_policies.json');
const PERSISTENT_REFUNDS_FILES = resolveCandidatePaths('persistent_refunds.json');
const PERSISTENT_PLATFORM_EARNINGS_FILES = resolveCandidatePaths('persistent_platform_earnings.json');
const PERSISTENT_FIN_ADJUSTMENTS_FILES = resolveCandidatePaths('persistent_financial_adjustments.json');
const PERSISTENT_CATALOGUE_VEHICLES_FILES = resolveCandidatePaths('persistent_catalogue_vehicles.json');
const PERSISTENT_SERVICE_PRICING_FILES = resolveCandidatePaths('persistent_service_pricing_rules.json');
const PERSISTENT_PRICE_QUOTATIONS_FILES = resolveCandidatePaths('persistent_price_quotations.json');
const PERSISTENT_DESTINATION_MEDIA_FILES = resolveCandidatePaths('persistent_destination_media.json');

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
    if (process.env.DISABLE_DATABASE === 'true' || (!process.env.DATABASE_URL && process.env.NODE_ENV === 'test')) {
      this.isPostgresConnected = false;
      this.loadAllFromDisk();
      return;
    }

    this.pool = new Pool({
      connectionString: ENV.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      max: 20,
    });

    let connected = false;
    let lastErr: any = null;
    const isProd = process.env.NODE_ENV === 'production';
    const maxRetries = isProd ? 5 : 1;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = await this.pool.connect();
        client.release();
        connected = true;
        this.isPostgresConnected = true;
        console.log('✅ [Database] Connected successfully to PostgreSQL instance.');
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries) {
          console.log(`⏳ [Database] PostgreSQL connection attempt ${attempt}/${maxRetries} failed. Retrying in 2s...`);
          await new Promise((res) => setTimeout(res, 2000));
        }
      }
    }

    if (!connected) {
      this.isPostgresConnected = false;
      this.loadAllFromDisk();
      console.log('⚡ [Database] PostgreSQL not detected locally. Initialized in-memory data store with disk persistence. Notice:', lastErr?.message || lastErr);
      return;
    }

    try {
      // 1. Ensure Schema DDL exists in PostgreSQL & remove any legacy mock seed records
      await this.ensureSchema();

      // 2. Load all entities authoritatively from PostgreSQL into memory
      await this.loadAllFromPostgres();
    } catch (err) {
      console.error('⚠️ [Database] Error during schema/data synchronization:', err);
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
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
        DELETE FROM drivers WHERE id IN ('driver-001', 'usr_drv_001', 'usr_drv_002');
        DELETE FROM vehicles WHERE id IN ('veh-001', 'veh_001', 'veh_002') OR driver_id IN ('driver-001', 'usr_drv_001', 'usr_drv_002');
        DELETE FROM tour_guides WHERE id IN ('usr_gd_001');
        DELETE FROM users WHERE id IN ('driver-001', 'usr_ug_001', 'usr_drv_001', 'usr_drv_002', 'usr_gd_001');
        UPDATE users SET wallet_balance_ugx = 0 WHERE id NOT IN (SELECT DISTINCT user_id FROM wallet_transactions);
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
    this.loadTableFromDisk(PERSISTENT_WALLET_TX_FILES, localStore.wallet_transactions, 'wallet_transactions');
    this.loadTableFromDisk(PERSISTENT_REFUND_POLICIES_FILES, localStore.refund_policies, 'refund_policies');
    this.loadTableFromDisk(PERSISTENT_REFUNDS_FILES, localStore.refunds, 'refunds');
    this.loadTableFromDisk(PERSISTENT_PLATFORM_EARNINGS_FILES, localStore.platform_earnings, 'platform_earnings');
    this.loadTableFromDisk(PERSISTENT_FIN_ADJUSTMENTS_FILES, localStore.financial_adjustments, 'financial_adjustments');
    this.loadTableFromDisk(PERSISTENT_CATALOGUE_VEHICLES_FILES, localStore.catalogue_vehicles, 'catalogue_vehicles');
    this.loadTableFromDisk(PERSISTENT_SERVICE_PRICING_FILES, localStore.service_pricing_rules, 'service_pricing_rules');
    this.loadTableFromDisk(PERSISTENT_PRICE_QUOTATIONS_FILES, localStore.price_quotations, 'price_quotations');
    this.loadTableFromDisk(PERSISTENT_DESTINATION_MEDIA_FILES, localStore.destination_media, 'destination_media');
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
    this.saveTableToDisk(PERSISTENT_WALLET_TX_FILES, localStore.wallet_transactions);
    this.saveTableToDisk(PERSISTENT_REFUND_POLICIES_FILES, localStore.refund_policies);
    this.saveTableToDisk(PERSISTENT_REFUNDS_FILES, localStore.refunds);
    this.saveTableToDisk(PERSISTENT_PLATFORM_EARNINGS_FILES, localStore.platform_earnings);
    this.saveTableToDisk(PERSISTENT_FIN_ADJUSTMENTS_FILES, localStore.financial_adjustments);
    this.saveTableToDisk(PERSISTENT_CATALOGUE_VEHICLES_FILES, localStore.catalogue_vehicles);
    this.saveTableToDisk(PERSISTENT_SERVICE_PRICING_FILES, localStore.service_pricing_rules);
    this.saveTableToDisk(PERSISTENT_PRICE_QUOTATIONS_FILES, localStore.price_quotations);
    this.saveTableToDisk(PERSISTENT_DESTINATION_MEDIA_FILES, localStore.destination_media);
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
      localStore.wallet_transactions.clear();
      localStore.refund_policies.clear();
      localStore.refunds.clear();
      localStore.platform_earnings.clear();
      localStore.financial_adjustments.clear();

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

      // 4. Tour Guides
      const tgRes = await this.pool.query('SELECT * FROM tour_guides');
      if (tgRes?.rows?.length > 0) {
        for (const row of tgRes.rows) {
          localStore.tour_guides.set(row.id, {
            ...row,
            is_approved: row.is_approved === true,
            approval_status: row.approval_status || 'PENDING_APPROVAL',
            is_available: row.is_available !== false,
            is_uwa_certified: row.is_uwa_certified !== false,
            daily_rate_ugx: parseFloat(row.daily_rate_ugx || '150000'),
            expeditions_count: parseInt(row.expeditions_count || '0', 10),
            rating: parseFloat(row.rating || '4.95'),
          });
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
          localStore.trips.set(row.id, {
            ...row,
            pickup_lat: parseFloat(row.pickup_lat || '0.3136'),
            pickup_lng: parseFloat(row.pickup_lng || '32.5811'),
            dest_lat: parseFloat(row.dest_lat || '0.3476'),
            dest_lng: parseFloat(row.dest_lng || '32.5825'),
            distance_km: parseFloat(row.distance_km || '1.0'),
            estimated_duration_mins: parseInt(row.estimated_duration_mins || '10', 10),
            fare_ugx: parseFloat(row.fare_ugx || '0'),
            tip_ugx: parseFloat(row.tip_ugx || '0'),
            created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
          });
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
          const guideId = row.tour_guide_id || row.guide_id || null;
          const bookingStatus = row.booking_status || row.status || 'CONFIRMED';
          const travelDate = row.travel_date || (row.start_date ? String(row.start_date).slice(0, 10) : new Date().toISOString().slice(0, 10));
          const guestsCount = parseInt(row.guests_count || row.travelers_count || '1', 10);
          localStore.tour_bookings.set(row.id, {
            ...row,
            guide_id: guideId,
            tour_guide_id: guideId,
            status: bookingStatus,
            booking_status: bookingStatus,
            travel_date: travelDate,
            start_date: travelDate,
            guests_count: guestsCount,
            travelers_count: guestsCount,
            total_ugx: parseFloat(row.total_ugx || '0'),
            created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
          });
        }
      }

      // 9. Payments
      const payRes = await this.pool.query('SELECT * FROM payments ORDER BY created_at DESC LIMIT 500');
      if (payRes?.rows?.length > 0) {
        for (const row of payRes.rows) {
          const fallbackStatus = row.status === 'COMPLETED' ? 'SUCCESSFUL' : (row.status === 'FAILED' ? 'FAILED' : (row.status === 'REFUNDED' ? 'REFUNDED' : 'PENDING'));
          localStore.payments.set(row.id, {
            id: row.id,
            transaction_id: row.reference,
            user_id: row.user_id,
            reference_type: row.trip_id ? 'TRIP' : (row.booking_id ? 'TOUR' : (row.delivery_id ? 'DELIVERY' : 'WALLET')),
            reference_id: row.trip_id || row.booking_id || row.delivery_id || row.user_id,
            amount_ugx: parseFloat(row.amount_ugx || '0'),
            currency: row.currency || 'UGX',
            payment_method: row.payment_method,
            phone: row.phone || '',
            idempotency_key: row.idempotency_key || undefined,
            attempt_number: parseInt(row.attempt_number || '1', 10),
            service_type_id: row.service_type_id || '54841',
            support_ticket_ref: row.support_ticket_ref || '2777504',
            dpo_trans_token: row.dpo_trans_token || '',
            dpo_trans_ref: row.dpo_trans_ref || row.reference,
            dpo_approval_code: row.dpo_approval_code || undefined,
            dpo_result_code: row.dpo_result_code || undefined,
            dpo_result_explanation: row.dpo_result_explanation || undefined,
            payment_url: row.payment_url || '',
            mobile_instructions: row.mobile_instructions || undefined,
            status: row.lifecycle_status || fallbackStatus,
            environment: (row.environment === 'production' ? 'production' : 'sandbox'),
            failure_reason: row.failure_reason || undefined,
            callback_count: parseInt(row.callback_count || '0', 10),
            last_callback_at: row.last_callback_at ? new Date(row.last_callback_at).toISOString() : undefined,
            audit_trail: Array.isArray(row.audit_trail) ? row.audit_trail : [],
            provider_metadata: row.provider_metadata || {},
            verified_at: row.verified_at ? new Date(row.verified_at).toISOString() : undefined,
            created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
          });
        }
      }

      // 10. App Config (admin_auth_config, pricing_matrix, master_config)
      const cfgRes = await this.pool.query('SELECT key, value, updated_at FROM app_config');
      if (cfgRes?.rows?.length > 0) {
        for (const row of cfgRes.rows) {
          localStore.app_config.set(row.key, {
            key: row.key,
            value: row.value,
            updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
          });
        }
      }

      // 11. Wallet Transactions
      try {
        const wtRes = await this.pool.query('SELECT * FROM wallet_transactions ORDER BY created_at ASC');
        if (wtRes?.rows?.length > 0) {
          for (const row of wtRes.rows) {
            localStore.wallet_transactions.set(row.id, {
              ...row,
              amount_ugx: parseFloat(row.amount_ugx || '0'),
              balance_after_ugx: parseFloat(row.balance_after_ugx || '0'),
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.warn('[Database] Wallet transactions sync notice:', err);
      }

      // 12. Refund Policies
      try {
        const rpRes = await this.pool.query('SELECT * FROM refund_policies ORDER BY created_at ASC');
        if (rpRes?.rows?.length > 0) {
          for (const row of rpRes.rows) {
            localStore.refund_policies.set(row.id, {
              ...row,
              max_waiting_minutes: parseInt(row.max_waiting_minutes || '15', 10),
              refund_percentage: parseFloat(row.refund_percentage || '100'),
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
              updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.warn('[Database] Refund policies sync notice:', err);
      }

      // 13. Refunds
      try {
        const rfRes = await this.pool.query('SELECT * FROM refunds ORDER BY created_at ASC');
        if (rfRes?.rows?.length > 0) {
          for (const row of rfRes.rows) {
            localStore.refunds.set(row.id, {
              ...row,
              amount_ugx: parseFloat(row.amount_ugx || '0'),
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
              updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.warn('[Database] Refunds sync notice:', err);
      }

      // 14. Platform Earnings
      try {
        const peRes = await this.pool.query('SELECT * FROM platform_earnings ORDER BY created_at ASC');
        if (peRes?.rows?.length > 0) {
          for (const row of peRes.rows) {
            localStore.platform_earnings.set(row.id, {
              ...row,
              gross_amount_ugx: parseFloat(row.gross_amount_ugx || '0'),
              platform_commission_ugx: parseFloat(row.platform_commission_ugx || '0'),
              platform_commission_rate: parseFloat(row.platform_commission_rate || '15'),
              beneficiary_earnings_ugx: parseFloat(row.beneficiary_earnings_ugx || '0'),
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
              updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.warn('[Database] Platform earnings sync notice:', err);
      }

      // 15. Financial Adjustments
      try {
        const faRes = await this.pool.query('SELECT * FROM financial_adjustments ORDER BY created_at ASC');
        if (faRes?.rows?.length > 0) {
          for (const row of faRes.rows) {
            localStore.financial_adjustments.set(row.id, {
              ...row,
              amount_ugx: parseFloat(row.amount_ugx || '0'),
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.warn('[Database] Financial adjustments sync notice:', err);
      }

      // 15b. Catalogue Vehicles
      try {
        localStore.catalogue_vehicles.clear();
        const cvRes = await this.pool.query('SELECT * FROM catalogue_vehicles ORDER BY display_order ASC, created_at ASC');
        if (cvRes?.rows?.length > 0) {
          for (const row of cvRes.rows) {
            localStore.catalogue_vehicles.set(row.id, {
              ...row,
              passenger_capacity: parseInt(row.passenger_capacity || '4', 10),
              luggage_capacity: parseInt(row.luggage_capacity || '2', 10),
              max_weight_kg: parseFloat(row.max_weight_kg || '50'),
              eta_minutes: parseInt(row.eta_minutes || '5', 10),
              is_available: row.is_available !== false,
              is_active: row.is_active !== false,
              display_order: parseInt(row.display_order || '0', 10),
              pricing_version: parseInt(row.pricing_version || '1', 10),
              assigned_services: Array.isArray(row.assigned_services) ? row.assigned_services : [],
              service_pricing: row.service_pricing || {},
            });
          }
        }
      } catch (err) {
        console.warn('[Database] Catalogue vehicles sync notice:', err);
      }

      // 15c. Service Pricing Rules
      try {
        localStore.service_pricing_rules.clear();
        const sprRes = await this.pool.query('SELECT * FROM service_pricing_rules');
        if (sprRes?.rows?.length > 0) {
          for (const row of sprRes.rows) {
            localStore.service_pricing_rules.set(row.service_key, {
              id: row.service_key,
              service_key: row.service_key,
              config: row.config || {},
              pricing_version: parseInt(row.pricing_version || '1', 10),
              updated_by: row.updated_by || 'ADMIN',
              updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.warn('[Database] Service pricing rules sync notice:', err);
      }

      // 15d. Price Quotations
      try {
        localStore.price_quotations.clear();
        const pqRes = await this.pool.query('SELECT * FROM price_quotations ORDER BY created_at DESC LIMIT 500');
        if (pqRes?.rows?.length > 0) {
          for (const row of pqRes.rows) {
            localStore.price_quotations.set(row.id, {
              ...row,
              base_price_ugx: Number(row.base_price_ugx || 0),
              distance_price_ugx: Number(row.distance_price_ugx || 0),
              vehicle_charge_ugx: Number(row.vehicle_charge_ugx || 0),
              tourist_count_charge_ugx: Number(row.tourist_count_charge_ugx || 0),
              tour_guide_fee_ugx: Number(row.tour_guide_fee_ugx || 0),
              additional_charges_ugx: Number(row.additional_charges_ugx || 0),
              discounts_ugx: Number(row.discounts_ugx || 0),
              taxes_ugx: Number(row.taxes_ugx || 0),
              total_price_ugx: Number(row.total_price_ugx || 0),
              pricing_version: parseInt(row.pricing_version || '1', 10),
            });
          }
        }
      } catch (err) {
        console.warn('[Database] Price quotations sync notice:', err);
      }

      // 15e. Destination Media
      try {
        localStore.destination_media.clear();
        const dmRes = await this.pool.query('SELECT * FROM destination_media ORDER BY display_order ASC, created_at ASC');
        if (dmRes?.rows?.length > 0) {
          for (const row of dmRes.rows) {
            localStore.destination_media.set(row.id, row);
          }
        }
      } catch (err) {
        console.warn('[Database] Destination media sync notice:', err);
      }

      // 15f. Destinations
      try {
        localStore.destinations.clear();
        const destRes = await this.pool.query('SELECT * FROM destinations ORDER BY display_order ASC, created_at ASC');
        if (destRes?.rows?.length > 0) {
          for (const row of destRes.rows) {
            localStore.destinations.set(row.id, {
              ...row,
              imageUrl: row.image_url || '',
              image_url: row.image_url || '',
              image_placeholder: row.image_placeholder || row.image_url || '',
              gallery_images: Array.isArray(row.gallery_images) ? row.gallery_images : [],
              galleryImages: Array.isArray(row.gallery_images) ? row.gallery_images : [],
              content_blocks: Array.isArray(row.content_blocks) ? row.content_blocks : [],
              contentBlocks: Array.isArray(row.content_blocks) ? row.content_blocks : [],
              highlights: Array.isArray(row.highlights) ? row.highlights : [],
              activities: Array.isArray(row.activities) ? row.activities : [],
              inclusions: Array.isArray(row.inclusions) ? row.inclusions : [],
              exclusions: Array.isArray(row.exclusions) ? row.exclusions : [],
              assigned_vehicle_ids: Array.isArray(row.assigned_vehicle_ids) ? row.assigned_vehicle_ids : [],
              assigned_guide_ids: Array.isArray(row.assigned_guide_ids) ? row.assigned_guide_ids : [],
              tourist_pricing_tiers: Array.isArray(row.tourist_pricing_tiers) ? row.tourist_pricing_tiers : [],
              itinerary: Array.isArray(row.itinerary) ? row.itinerary : [],
              additional_charges: Array.isArray(row.additional_charges) ? row.additional_charges : [],
            });
          }
          console.log(`🏞️ [Database] Synchronized ${destRes.rows.length} destinations from PostgreSQL.`);
        }
      } catch (err) {
        console.warn('[Database] Destinations sync notice:', err);
      }

      // 15g. Tour Packages
      try {
        localStore.tour_packages.clear();
        const pkgRes = await this.pool.query('SELECT * FROM tour_packages ORDER BY display_order ASC, created_at ASC');
        if (pkgRes?.rows?.length > 0) {
          for (const row of pkgRes.rows) {
            localStore.tour_packages.set(row.id, {
              ...row,
              imageUrl: row.image_url || '',
              image_url: row.image_url || '',
              image_placeholder: row.image_placeholder || row.image_url || '',
              gallery_images: Array.isArray(row.gallery_images) ? row.gallery_images : [],
              inclusions: Array.isArray(row.inclusions) ? row.inclusions : [],
              exclusions: Array.isArray(row.exclusions) ? row.exclusions : [],
              itinerary_summary: Array.isArray(row.itinerary_summary) ? row.itinerary_summary : [],
              tourist_pricing_tiers: Array.isArray(row.tourist_pricing_tiers) ? row.tourist_pricing_tiers : [],
            });
          }
          console.log(`🎒 [Database] Synchronized ${pkgRes.rows.length} tour packages from PostgreSQL.`);
        }
      } catch (err) {
        console.warn('[Database] Tour packages sync notice:', err);
      }

      // 16. Auto-reconcile any driver applications or driver users missing from drivers/vehicles tables
      for (const app of localStore.career_applications.values()) {
        if (app.applicant_type === 'driver' && app.user_id) {
          const existingDriver = localStore.drivers.get(app.user_id);
          if (!existingDriver) {
            let vehicleId: string | null = null;
            if (app.vehicle_plate) {
              vehicleId = `veh_${app.id.replace(/^app_/, '')}`;
              const vehicle = {
                id: vehicleId,
                driver_id: app.user_id,
                tier: app.vehicle_tier || 'safari_4x4',
                make: app.vehicle_make || 'Toyota',
                model: app.vehicle_model || 'Land Cruiser',
                color: 'White',
                registration_plate: String(app.vehicle_plate).trim().toUpperCase(),
                capacity: 4,
                status: 'active',
                created_at: app.created_at || new Date().toISOString(),
              };
              await this.persistVehicle(vehicle);
            }
            const isApproved = app.status === 'APPROVED';
            const reconciledDriver = {
              id: app.user_id,
              vehicle_id: vehicleId,
              is_online: isApproved,
              is_available: isApproved,
              is_approved: isApproved,
              approval_status: app.status || 'PENDING_APPROVAL',
              current_lat: 0.3136,
              current_lng: 32.5811,
              heading: 0,
              speed: 0,
              license_number: app.license_number || '',
              national_id: app.national_id || '',
              driving_permit_number: app.license_number || '',
              years_of_experience: Number(app.experience_years || 0),
              acceptance_rate: 98.0,
              today_earnings_ugx: 0,
              application_date: app.created_at || new Date().toISOString(),
              approved_by: app.reviewed_by || null,
              approved_at: app.reviewed_at || null,
              rejection_reason: app.rejection_reason || null,
              updated_at: new Date().toISOString(),
            };
            await this.persistDriver(reconciledDriver);
            console.log(`✅ [Database] Reconciled driver record for ${app.full_name} (${app.user_id})`);
          }
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

  public async persistVehicle(vehicle: any): Promise<void> {
    if (!vehicle || !vehicle.id) return;
    localStore.vehicles.set(vehicle.id, vehicle);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO vehicles (id, driver_id, tier, make, model, registration_plate, color, capacity, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             driver_id = EXCLUDED.driver_id,
             tier = EXCLUDED.tier,
             make = EXCLUDED.make,
             model = EXCLUDED.model,
             registration_plate = EXCLUDED.registration_plate,
             color = EXCLUDED.color,
             capacity = EXCLUDED.capacity,
             status = EXCLUDED.status`,
          [
            vehicle.id,
            vehicle.driver_id || null,
            vehicle.tier || 'go',
            vehicle.make || 'Toyota',
            vehicle.model || 'Safari',
            vehicle.registration_plate || `UG-${vehicle.id}`,
            vehicle.color || 'White',
            vehicle.capacity || vehicle.seating_capacity || 4,
            vehicle.status || 'active',
          ]
        );
      } catch (err) {
        console.error('[Database Error] Failed to persist vehicle to PostgreSQL:', err);
      }
    }
  }

  public async getUserById(id: string): Promise<any | null> {
    if (!id) return null;
    if (process.env.NODE_ENV === 'test' && !this.isPostgresConnected) return localStore.users.get(id) || null;
    if (!this.isPostgresConnected || !this.pool) throw new Error('Authoritative user storage unavailable.');
    if (this.isPostgresConnected && this.pool) {
      try {
        const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (res.rows.length > 0) {
          const u = res.rows[0];
          localStore.users.set(u.id, u);
          return u;
        }
      } catch (err) {
        console.warn('[Database] getUserById PostgreSQL notice:', err);
      }
    }
    return null;
  }

  public async findUserByLogin(identifier: string): Promise<any | null> {
    const value = identifier.trim().toLowerCase();
    const { getUgandaPhoneVariants } = await import('../shared/phone');
    const phones = value.includes('@') ? [] : getUgandaPhoneVariants(identifier);
    if (this.isPostgresConnected) {
      const result = await this.query('SELECT * FROM users WHERE LOWER(email) = $1 OR phone = ANY($2::text[]) LIMIT 1', [value, phones]);
      return result.rows[0] || null;
    }
    if (process.env.NODE_ENV !== 'test') throw new Error('Authoritative user storage unavailable.');
    return Array.from(localStore.users.values()).find(u => u.email?.toLowerCase() === value || phones.includes(u.phone)) || null;
  }

  /** Security mutations are narrow and serialized against the current database row. */
  public async updateUserSecurity(id: string, changes: { role?: string; approval_status?: string; is_verified?: boolean; password_hash?: string }, revoke = true, expectedPasswordHash?: string): Promise<any> {
    if (process.env.NODE_ENV !== 'test' && !this.isPostgresConnected) throw new Error('Authoritative user storage unavailable.');
    const keys = ['role', 'approval_status', 'is_verified', 'password_hash'].filter(k => (changes as any)[k] !== undefined);
    let updated: any;
    await this.withTransaction(async client => {
      const current = client ? (await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0] : localStore.users.get(id);
      if (!current || (expectedPasswordHash && current.password_hash !== expectedPasswordHash)) throw new Error('User security state changed. Please retry.');
      if (!client) updated = { ...current, ...changes, ...(changes.password_hash ? { password_changed_at: new Date().toISOString() } : {}), token_version: Number(current.token_version ?? 1) + (revoke ? 1 : 0) };
      else {
        const values = keys.map(k => (changes as any)[k]);
        const assignments = keys.map((k, i) => `${k} = $${i + 2}`);
        if (changes.password_hash) assignments.push('password_changed_at = CURRENT_TIMESTAMP');
        assignments.push(`token_version = COALESCE(token_version, 1) + ${revoke ? 1 : 0}`, 'updated_at = CURRENT_TIMESTAMP');
        updated = (await client.query(`UPDATE users SET ${assignments.join(', ')} WHERE id = $1 RETURNING *`, [id, ...values])).rows[0];
      }
    });
    localStore.users.set(id, updated); this.saveUsersToDisk(); return updated;
  }

  public async updateUserProfile(id: string, changes: Record<string, any>): Promise<any> {
    const keys = ['full_name', 'email', 'phone', 'avatar_url'].filter(k => changes[k] !== undefined);
    let updated: any;
    if (process.env.NODE_ENV !== 'test' && !this.isPostgresConnected) throw new Error('Authoritative user storage unavailable.');
    if (this.isPostgresConnected && keys.length) {
      updated = (await this.query(`UPDATE users SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`, [id, ...keys.map(k => changes[k])])).rows[0];
    } else {
      const current = await this.getUserById(id);
      updated = current && { ...current, ...Object.fromEntries(keys.map(k => [k, changes[k]])) };
    }
    if (!updated) throw new Error('User not found.');
    localStore.users.set(id, updated); this.saveUsersToDisk(); return updated;
  }

  public async persistUser(user: any): Promise<void> {
    if (process.env.NODE_ENV === 'production' && !this.isPostgresConnected) throw new Error('Durable user storage required.');

    // 2. Persist to PostgreSQL if connected
    if (this.isPostgresConnected && this.pool) {
      try {
        const persisted = await this.pool.query(
          `INSERT INTO users (
             id, full_name, phone, email, password_hash, role, avatar_url,
             rating, total_trips, wallet_balance_ugx, is_verified, approval_status, application_id, token_version, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             full_name = EXCLUDED.full_name,
             phone = EXCLUDED.phone,
             email = EXCLUDED.email,
             avatar_url = EXCLUDED.avatar_url,
             rating = EXCLUDED.rating,
             total_trips = EXCLUDED.total_trips,
             wallet_balance_ugx = EXCLUDED.wallet_balance_ugx,
             updated_at = CURRENT_TIMESTAMP RETURNING *`,
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
            user.approval_status || 'APPROVED',
            user.application_id || null,
            Number(user.token_version ?? 1),
            user.created_at || new Date().toISOString(),
          ]
        );
        user = { ...user, ...persisted.rows[0] };
      } catch (err) {
        throw err;
      }
    }

    // Publish only after the durable write succeeds.
    localStore.users.set(user.id, user);
    this.saveUsersToDisk();
  }

  public async persistDriver(driver: any): Promise<void> {
    localStore.drivers.set(driver.id, driver);
    if (this.isPostgresConnected && this.pool) {
      if (driver.vehicle_id && localStore.vehicles.has(driver.vehicle_id)) {
        await this.persistVehicle(localStore.vehicles.get(driver.vehicle_id));
      }
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

  public async persistTrip(trip: any): Promise<void> {
    localStore.trips.set(trip.id, trip);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO trips (
             id, customer_id, driver_id, pickup_title, pickup_address,
             pickup_lat, pickup_lng, dest_title, dest_address, dest_lat, dest_lng,
             vehicle_tier, status, distance_km, estimated_duration_mins,
             fare_ugx, tip_ugx, payment_method, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             $16, $17, $18, $19, CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
             driver_id = EXCLUDED.driver_id,
             status = EXCLUDED.status,
             fare_ugx = EXCLUDED.fare_ugx,
             tip_ugx = EXCLUDED.tip_ugx,
             payment_method = EXCLUDED.payment_method,
             updated_at = CURRENT_TIMESTAMP`,
          [
            trip.id,
            trip.customer_id || null,
            trip.driver_id || null,
            trip.pickup_title || 'Pickup',
            trip.pickup_address || '',
            Number(trip.pickup_lat ?? 0.3136),
            Number(trip.pickup_lng ?? 32.5811),
            trip.dest_title || 'Destination',
            trip.dest_address || '',
            Number(trip.dest_lat ?? 0.3476),
            Number(trip.dest_lng ?? 32.5825),
            trip.vehicle_tier || 'go',
            trip.status || 'SEARCHING',
            Number(trip.distance_km ?? 1.0),
            Number(trip.estimated_duration_mins ?? 10),
            Number(trip.fare_ugx ?? 0),
            Number(trip.tip_ugx ?? 0),
            trip.payment_method || 'MTN Mobile Money',
            trip.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.error('[Database Error] Failed to persist trip to PostgreSQL:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_TRIPS_FILES, localStore.trips);
  }

  public async persistTourBooking(booking: any): Promise<void> {
    localStore.tour_bookings.set(booking.id, booking);
    if (this.isPostgresConnected && this.pool) {
      try {
        const guideId = booking.tour_guide_id || booking.guide_id || null;
        const bookingStatus = booking.booking_status || booking.status || 'CONFIRMED';
        const travelDate = booking.travel_date || booking.start_date || new Date().toISOString().slice(0, 10);
        const guestsCount = Number(booking.guests_count ?? booking.travelers_count ?? 1);
        await this.pool.query(
          `INSERT INTO tour_bookings (
             id, customer_id, destination_id, package_id, guide_id, tour_guide_id,
             travelers_count, guests_count, start_date, travel_date, pickup_location,
             special_requests, total_ugx, status, booking_status, payment_method,
             payment_status, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
             $17, $18, CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
             destination_id = EXCLUDED.destination_id,
             package_id = EXCLUDED.package_id,
             guide_id = EXCLUDED.guide_id,
             tour_guide_id = EXCLUDED.tour_guide_id,
             travelers_count = EXCLUDED.travelers_count,
             guests_count = EXCLUDED.guests_count,
             start_date = EXCLUDED.start_date,
             travel_date = EXCLUDED.travel_date,
             pickup_location = EXCLUDED.pickup_location,
             special_requests = EXCLUDED.special_requests,
             total_ugx = EXCLUDED.total_ugx,
             status = EXCLUDED.status,
             booking_status = EXCLUDED.booking_status,
             payment_method = EXCLUDED.payment_method,
             payment_status = EXCLUDED.payment_status,
             updated_at = CURRENT_TIMESTAMP`,
          [
            booking.id,
            booking.customer_id || null,
            booking.destination_id || null,
            booking.package_id || null,
            guideId,
            guideId,
            guestsCount,
            guestsCount,
            travelDate,
            travelDate,
            booking.pickup_location || 'Kampala',
            booking.special_requests || '',
            Number(booking.total_ugx ?? 0),
            bookingStatus,
            bookingStatus,
            booking.payment_method || 'MTN Mobile Money',
            booking.payment_status || 'PENDING',
            booking.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.error('[Database Error] Failed to persist tour booking to PostgreSQL:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_BOOKINGS_FILES, localStore.tour_bookings);
  }

  public async persistPayment(payment: any): Promise<void> {
    localStore.payments.set(payment.id, payment);
    if (this.isPostgresConnected && this.pool) {
      try {
        const sqlStatus =
          payment.status === 'SUCCESSFUL'
            ? 'COMPLETED'
            : payment.status === 'REFUNDED'
            ? 'REFUNDED'
            : payment.status === 'FAILED' || payment.status === 'CANCELLED' || payment.status === 'EXPIRED'
            ? 'FAILED'
            : 'PENDING';

        await this.pool.query(
          `INSERT INTO payments (
             id, user_id, trip_id, delivery_id, booking_id, amount_ugx,
             currency, payment_method, phone, reference, idempotency_key,
             attempt_number, service_type_id, support_ticket_ref,
             dpo_trans_token, dpo_trans_ref, dpo_approval_code,
             dpo_result_code, dpo_result_explanation, payment_url,
             mobile_instructions, failure_reason, environment,
             lifecycle_status, status, callback_count, last_callback_at,
             audit_trail, provider_metadata, verified_at, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, $11,
             $12, $13, $14,
             $15, $16, $17,
             $18, $19, $20,
             $21, $22, $23,
             $24, $25, $26, $27,
             $28, $29, $30, $31, CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
             phone = EXCLUDED.phone,
             idempotency_key = EXCLUDED.idempotency_key,
             attempt_number = EXCLUDED.attempt_number,
             service_type_id = EXCLUDED.service_type_id,
             dpo_trans_token = EXCLUDED.dpo_trans_token,
             dpo_trans_ref = EXCLUDED.dpo_trans_ref,
             dpo_approval_code = EXCLUDED.dpo_approval_code,
             dpo_result_code = EXCLUDED.dpo_result_code,
             dpo_result_explanation = EXCLUDED.dpo_result_explanation,
             payment_url = EXCLUDED.payment_url,
             mobile_instructions = EXCLUDED.mobile_instructions,
             failure_reason = EXCLUDED.failure_reason,
             environment = EXCLUDED.environment,
             lifecycle_status = EXCLUDED.lifecycle_status,
             status = EXCLUDED.status,
             callback_count = EXCLUDED.callback_count,
             last_callback_at = EXCLUDED.last_callback_at,
             audit_trail = EXCLUDED.audit_trail,
             provider_metadata = EXCLUDED.provider_metadata,
             verified_at = EXCLUDED.verified_at,
             updated_at = CURRENT_TIMESTAMP`,
          [
            payment.id,
            payment.user_id || null,
            payment.reference_type === 'TRIP' ? payment.reference_id : null,
            payment.reference_type === 'DELIVERY' ? payment.reference_id : null,
            payment.reference_type === 'TOUR' ? payment.reference_id : null,
            Number(payment.amount_ugx ?? 0),
            payment.currency || 'UGX',
            payment.payment_method || 'CARD',
            payment.phone || '',
            payment.transaction_id,
            payment.idempotency_key || null,
            Number(payment.attempt_number ?? 1),
            payment.service_type_id || '54841',
            payment.support_ticket_ref || '2777504',
            payment.dpo_trans_token || '',
            payment.dpo_trans_ref || payment.transaction_id,
            payment.dpo_approval_code || null,
            payment.dpo_result_code || null,
            payment.dpo_result_explanation || null,
            payment.payment_url || '',
            payment.mobile_instructions || null,
            payment.failure_reason || null,
            payment.environment === 'production' ? 'production' : 'sandbox',
            payment.status || 'INITIATED',
            sqlStatus,
            Number(payment.callback_count ?? 0),
            payment.last_callback_at || null,
            JSON.stringify(payment.audit_trail || []),
            JSON.stringify(payment.provider_metadata || {}),
            payment.verified_at || null,
            payment.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.warn('[Database] persistPayment PostgreSQL notice:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_PAYMENTS_FILES, localStore.payments);
  }

  public async persistWalletTransaction(tx: any): Promise<void> {
    if (!tx || !tx.id) return;
    localStore.wallet_transactions.set(tx.id, tx);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO wallet_transactions (
             id, user_id, amount_ugx, balance_after_ugx, type,
             reference_type, reference_id, payment_id, refund_id,
             environment, idempotency_key, description, metadata, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO NOTHING`,
          [
            tx.id,
            tx.user_id,
            Number(tx.amount_ugx ?? 0),
            Number(tx.balance_after_ugx ?? 0),
            tx.type,
            tx.reference_type,
            tx.reference_id,
            tx.payment_id || null,
            tx.refund_id || null,
            tx.environment || 'sandbox',
            tx.idempotency_key || null,
            tx.description || '',
            JSON.stringify(tx.metadata || {}),
            tx.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.warn('[Database] persistWalletTransaction PostgreSQL notice:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_WALLET_TX_FILES, localStore.wallet_transactions);
  }

  public async persistRefundPolicy(policy: any): Promise<void> {
    if (!policy || !policy.id) return;
    localStore.refund_policies.set(policy.id, policy);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO refund_policies (
             id, policy_name, is_enabled, max_waiting_minutes,
             applicable_service_types, applicable_payment_methods,
             refund_percentage, require_driver_assigned, require_no_arrival,
             auto_process_enabled, updated_by, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             policy_name = EXCLUDED.policy_name,
             is_enabled = EXCLUDED.is_enabled,
             max_waiting_minutes = EXCLUDED.max_waiting_minutes,
             applicable_service_types = EXCLUDED.applicable_service_types,
             applicable_payment_methods = EXCLUDED.applicable_payment_methods,
             refund_percentage = EXCLUDED.refund_percentage,
             require_driver_assigned = EXCLUDED.require_driver_assigned,
             require_no_arrival = EXCLUDED.require_no_arrival,
             auto_process_enabled = EXCLUDED.auto_process_enabled,
             updated_by = EXCLUDED.updated_by,
             updated_at = CURRENT_TIMESTAMP`,
          [
            policy.id,
            policy.policy_name,
            policy.is_enabled !== false,
            Number(policy.max_waiting_minutes ?? 15),
            policy.applicable_service_types || ['ride', 'airport_shuttle', 'delivery'],
            policy.applicable_payment_methods || ['WALLET', 'CARD', 'MTN_MOMO', 'AIRTEL_MONEY'],
            Number(policy.refund_percentage ?? 100),
            policy.require_driver_assigned !== false,
            policy.require_no_arrival !== false,
            policy.auto_process_enabled !== false,
            policy.updated_by || 'ADMIN',
            policy.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.warn('[Database] persistRefundPolicy PostgreSQL notice:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_REFUND_POLICIES_FILES, localStore.refund_policies);
  }

  public async persistRefund(refund: any): Promise<void> {
    if (!refund || !refund.id) return;
    localStore.refunds.set(refund.id, refund);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO refunds (
             id, refund_reference, payment_id, booking_id, trip_id, delivery_id,
             user_id, amount_ugx, currency, reason, refund_method,
             status, environment, policy_version, policy_snapshot,
             eligibility_evidence, dpo_refund_trans_token, failure_reason,
             processed_by, processed_at, audit_trail, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             failure_reason = EXCLUDED.failure_reason,
             processed_by = EXCLUDED.processed_by,
             processed_at = EXCLUDED.processed_at,
             dpo_refund_trans_token = EXCLUDED.dpo_refund_trans_token,
             audit_trail = EXCLUDED.audit_trail,
             updated_at = CURRENT_TIMESTAMP`,
          [
            refund.id,
            refund.refund_reference,
            refund.payment_id || null,
            refund.booking_id || null,
            refund.trip_id || null,
            refund.delivery_id || null,
            refund.user_id,
            Number(refund.amount_ugx ?? 0),
            refund.currency || 'UGX',
            refund.reason || 'NO_SHOW_DRIVER',
            refund.refund_method || 'WALLET',
            refund.status || 'PENDING',
            refund.environment || 'sandbox',
            refund.policy_version || '1.0',
            JSON.stringify(refund.policy_snapshot || {}),
            JSON.stringify(refund.eligibility_evidence || {}),
            refund.dpo_refund_trans_token || null,
            refund.failure_reason || null,
            refund.processed_by || 'SYSTEM_AUTO_WORKER',
            refund.processed_at || null,
            JSON.stringify(refund.audit_trail || []),
            refund.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.warn('[Database] persistRefund PostgreSQL notice:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_REFUNDS_FILES, localStore.refunds);
  }

  public async persistPlatformEarning(earning: any): Promise<void> {
    if (!earning || !earning.id) return;
    localStore.platform_earnings.set(earning.id, earning);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO platform_earnings (
             id, booking_type, booking_id, payment_id, payer_user_id, beneficiary_id,
             gross_amount_ugx, platform_commission_ugx, platform_commission_rate,
             beneficiary_earnings_ugx, payment_method, environment, status,
             refund_id, metadata, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             refund_id = EXCLUDED.refund_id,
             metadata = EXCLUDED.metadata,
             updated_at = CURRENT_TIMESTAMP`,
          [
            earning.id,
            earning.booking_type,
            earning.booking_id,
            earning.payment_id || null,
            earning.payer_user_id || null,
            earning.beneficiary_id || null,
            Number(earning.gross_amount_ugx ?? 0),
            Number(earning.platform_commission_ugx ?? 0),
            Number(earning.platform_commission_rate ?? 15),
            Number(earning.beneficiary_earnings_ugx ?? 0),
            earning.payment_method || 'CARD',
            earning.environment || 'sandbox',
            earning.status || 'EARNED',
            earning.refund_id || null,
            JSON.stringify(earning.metadata || {}),
            earning.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.warn('[Database] persistPlatformEarning PostgreSQL notice:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_PLATFORM_EARNINGS_FILES, localStore.platform_earnings);
  }

  public async persistFinancialAdjustment(adj: any): Promise<void> {
    if (!adj || !adj.id) return;
    localStore.financial_adjustments.set(adj.id, adj);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO financial_adjustments (
             id, admin_id, target_type, target_id, amount_ugx, adjustment_type, reason, environment, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            adj.id,
            adj.admin_id || null,
            adj.target_type,
            adj.target_id,
            Number(adj.amount_ugx ?? 0),
            adj.adjustment_type,
            adj.reason || '',
            adj.environment || 'sandbox',
            adj.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.warn('[Database] persistFinancialAdjustment PostgreSQL notice:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_FIN_ADJUSTMENTS_FILES, localStore.financial_adjustments);
  }

  public async persistCatalogueVehicle(veh: any): Promise<void> {
    if (!veh || !veh.id) return;
    localStore.catalogue_vehicles.set(veh.id, veh);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO catalogue_vehicles (
             id, code, name, category, make, model, description, image_url,
             icon_name, passenger_capacity, luggage_capacity, max_weight_kg,
             eta_minutes, is_available, is_active, display_order,
             assigned_services, service_pricing, pricing_version, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
             $17, $18, $19, $20, CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
             code = EXCLUDED.code,
             name = EXCLUDED.name,
             category = EXCLUDED.category,
             make = EXCLUDED.make,
             model = EXCLUDED.model,
             description = EXCLUDED.description,
             image_url = EXCLUDED.image_url,
             icon_name = EXCLUDED.icon_name,
             passenger_capacity = EXCLUDED.passenger_capacity,
             luggage_capacity = EXCLUDED.luggage_capacity,
             max_weight_kg = EXCLUDED.max_weight_kg,
             eta_minutes = EXCLUDED.eta_minutes,
             is_available = EXCLUDED.is_available,
             is_active = EXCLUDED.is_active,
             display_order = EXCLUDED.display_order,
             assigned_services = EXCLUDED.assigned_services,
             service_pricing = EXCLUDED.service_pricing,
             pricing_version = EXCLUDED.pricing_version,
             updated_at = CURRENT_TIMESTAMP`,
          [
            veh.id,
            veh.code || veh.id,
            veh.name,
            veh.category || 'Sedan / Economy',
            veh.make || '',
            veh.model || '',
            veh.description || '',
            veh.image_url || '',
            veh.icon_name || 'directions_car',
            Number(veh.passenger_capacity ?? 4),
            Number(veh.luggage_capacity ?? 2),
            Number(veh.max_weight_kg ?? 50),
            Number(veh.eta_minutes ?? 5),
            veh.is_available !== false,
            veh.is_active !== false,
            Number(veh.display_order ?? 0),
            JSON.stringify(Array.isArray(veh.assigned_services) ? veh.assigned_services : []),
            JSON.stringify(veh.service_pricing || {}),
            Number(veh.pricing_version ?? 1),
            veh.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.warn('[Database] persistCatalogueVehicle PostgreSQL notice:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_CATALOGUE_VEHICLES_FILES, localStore.catalogue_vehicles);
  }

  public async deleteCatalogueVehicle(id: string): Promise<void> {
    localStore.catalogue_vehicles.delete(id);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query('DELETE FROM catalogue_vehicles WHERE id = $1', [id]);
      } catch (err) {
        console.warn('[Database] deleteCatalogueVehicle PostgreSQL notice:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_CATALOGUE_VEHICLES_FILES, localStore.catalogue_vehicles);
  }

  public async persistServicePricingRule(rule: any): Promise<void> {
    if (!rule || !rule.service_key) return;
    const record = { ...rule, id: rule.service_key };
    localStore.service_pricing_rules.set(rule.service_key, record);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO service_pricing_rules (service_key, config, pricing_version, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (service_key) DO UPDATE SET
             config = EXCLUDED.config,
             pricing_version = EXCLUDED.pricing_version,
             updated_by = EXCLUDED.updated_by,
             updated_at = CURRENT_TIMESTAMP`,
          [
            rule.service_key,
            JSON.stringify(rule.config || {}),
            Number(rule.pricing_version ?? 1),
            rule.updated_by || 'ADMIN',
          ]
        );
      } catch (err) {
        console.warn('[Database] persistServicePricingRule PostgreSQL notice:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_SERVICE_PRICING_FILES, localStore.service_pricing_rules);
  }

  public async persistPriceQuotation(quote: any): Promise<void> {
    if (!quote || !quote.id) return;
    localStore.price_quotations.set(quote.id, quote);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO price_quotations (
             id, service_type, reference_id, vehicle_id, guide_id, guest_count,
             distance_km, weight_kg, base_price_ugx, distance_price_ugx,
             vehicle_charge_ugx, tourist_count_charge_ugx, tour_guide_fee_ugx,
             additional_charges_ugx, discounts_ugx, taxes_ugx, total_price_ugx,
             currency, pricing_version, breakdown, request_params, expires_at, created_at,
             customer_id, consumed, consumed_at, consumed_by
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
             $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
           ) ON CONFLICT (id) DO UPDATE SET
             consumed = EXCLUDED.consumed,
             consumed_at = EXCLUDED.consumed_at,
             consumed_by = EXCLUDED.consumed_by`,
          [
            quote.id,
            quote.service_type,
            quote.reference_id || null,
            quote.vehicle_id || null,
            quote.guide_id || null,
            Number(quote.guest_count ?? 1),
            Number(quote.distance_km ?? 0),
            Number(quote.weight_kg ?? 0),
            Number(quote.base_price_ugx ?? 0),
            Number(quote.distance_price_ugx ?? 0),
            Number(quote.vehicle_charge_ugx ?? 0),
            Number(quote.tourist_count_charge_ugx ?? 0),
            Number(quote.tour_guide_fee_ugx ?? 0),
            Number(quote.additional_charges_ugx ?? 0),
            Number(quote.discounts_ugx ?? 0),
            Number(quote.taxes_ugx ?? 0),
            Number(quote.total_price_ugx ?? 0),
            quote.currency || 'UGX',
            Number(quote.pricing_version ?? 1),
            JSON.stringify(quote.breakdown || []),
            JSON.stringify(quote.request_params || {}),
            quote.expires_at || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            quote.created_at || new Date().toISOString(),
            quote.customer_id || null,
            quote.consumed === true,
            quote.consumed_at || null,
            quote.consumed_by || null,
          ]
        );
      } catch (err) {
        console.warn('[Database] persistPriceQuotation PostgreSQL notice:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_PRICE_QUOTATIONS_FILES, localStore.price_quotations);
  }

  public async consumeQuotationAtomic(quotationId: string, consumedBy: string): Promise<any | null> {
    if (this.isPostgresConnected && this.pool) {
      const res = await this.pool.query(
        `UPDATE price_quotations SET consumed = TRUE, consumed_at = CURRENT_TIMESTAMP, consumed_by = $2
         WHERE id = $1 AND consumed = FALSE AND customer_id = $2 AND expires_at > CURRENT_TIMESTAMP RETURNING *`,
        [quotationId, consumedBy]);
      if (res.rowCount !== 1) return null;
      localStore.price_quotations.set(quotationId, res.rows[0]);
      return res.rows[0];
    }
    if (process.env.NODE_ENV !== 'test') throw new Error('Durable quotation storage required.');
    const quote = localStore.price_quotations.get(quotationId);
    if (!quote || quote.customer_id !== consumedBy || quote.consumed || new Date(quote.expires_at).getTime() <= Date.now()) return null;
    const result = { ...quote, consumed: true, consumed_by: consumedBy, consumed_at: new Date().toISOString() };
    localStore.price_quotations.set(quotationId, result);
    return result;
  }

  private testConsumedTokens = new Set<string>();

  public async setPasswordWithTokenAtomic(params: { tokenHash: string; userId: string; email: string; passwordHash: string; expectedVersion: number; expiresAt: Date }): Promise<any> {
    let updated: any;
    await this.withTransaction(async client => {
      if (params.expiresAt.getTime() <= Date.now()) throw new Error('Setup token expired.');
      if (!client) {
        if (process.env.NODE_ENV !== 'test') throw new Error('Durable authentication storage required.');
        if (this.testConsumedTokens.has(params.tokenHash)) throw new Error('This setup token has already been used.');
        const user = localStore.users.get(params.userId);
        if (!user || user.email.toLowerCase() !== params.email || user.approval_status !== 'APPROVED' || Number(user.token_version || 1) !== params.expectedVersion) throw new Error('Account not eligible for password setup.');
        this.testConsumedTokens.add(params.tokenHash);
        updated = { ...user, password_hash: params.passwordHash, token_version: Number(user.token_version || 1) + 1, is_verified: true };
        return;
      }
      const user = (await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [params.userId])).rows[0];
      if (!user || user.email.toLowerCase() !== params.email || user.approval_status !== 'APPROVED' || Number(user.token_version || 1) !== params.expectedVersion) throw new Error('Account not eligible for password setup.');
      const claim = await client.query(
        `INSERT INTO consumed_auth_tokens(token_hash, token_type, user_id, expires_at)
         VALUES ($1, 'setup_password', $2, $3) ON CONFLICT DO NOTHING RETURNING token_hash`,
        [params.tokenHash, params.userId, params.expiresAt]);
      if (claim.rowCount !== 1) throw new Error('This setup token has already been used.');
      updated = (await client.query(
        `UPDATE users SET password_hash = $2, is_verified = TRUE, token_version = COALESCE(token_version, 1) + 1,
         updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`, [params.userId, params.passwordHash])).rows[0];
    });
    localStore.users.set(params.userId, updated);
    this.saveTableToDisk(PERSISTENT_USERS_FILES, localStore.users);
    return updated;
  }

  public async persistDestinationMedia(media: any): Promise<void> {
    if (!media || !media.id) return;
    localStore.destination_media.set(media.id, media);
    if (this.isPostgresConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO destination_media (
             id, owner_type, owner_id, media_type, source_type, url, r2_key,
             mime_type, title, caption, display_order, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
             url = EXCLUDED.url,
             r2_key = EXCLUDED.r2_key,
             title = EXCLUDED.title,
             caption = EXCLUDED.caption,
             display_order = EXCLUDED.display_order`,
          [
            media.id,
            media.owner_type || 'DESTINATION',
            media.owner_id,
            media.media_type || 'IMAGE',
            media.source_type || 'CLOUDFLARE_R2',
            media.url,
            media.r2_key || null,
            media.mime_type || 'image/jpeg',
            media.title || '',
            media.caption || '',
            Number(media.display_order ?? 0),
            media.created_at || new Date().toISOString(),
          ]
        );
      } catch (err) {
        console.warn('[Database] persistDestinationMedia PostgreSQL notice:', err);
      }
    }
    this.saveTableToDisk(PERSISTENT_DESTINATION_MEDIA_FILES, localStore.destination_media);
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

  /**
   * Executes a callback inside an atomic PostgreSQL transaction with automatic bounded retries
   * on serialization failure (40001) or deadlock detected (40P01).
   */
  public async withTransaction<T>(fn: (client: any | null) => Promise<T>, maxRetries = 4): Promise<T> {
    if (!this.isPostgresConnected || !this.pool) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('DURABLE_STORAGE_REQUIRED: Financial transactions require an active, durable PostgreSQL connection in production.');
      }
      return fn(null);
    }

    let attempt = 0;
    while (true) {
      attempt++;
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err: any) {
        try {
          await client.query('ROLLBACK');
        } catch (_) {}
        const pgCode = err?.code;
        if ((pgCode === '40001' || pgCode === '40P01') && attempt < maxRetries) {
          const delayMs = Math.min(200, 15 * Math.pow(2, attempt)) + Math.floor(Math.random() * 15);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      } finally {
        client.release();
      }
    }
  }

  public async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export const db = new DatabaseManager();
