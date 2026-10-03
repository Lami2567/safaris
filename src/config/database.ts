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
};

const PERSISTENT_USERS_FILES = [
  path.resolve(__dirname, '../database/persistent_users.json'),
  path.resolve(process.cwd(), 'src/database/persistent_users.json'),
  path.resolve(process.cwd(), 'backend/src/database/persistent_users.json'),
  path.resolve(process.cwd(), 'persistent_users.json'),
];

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
    // 1. First load any offline/persistent users from disk so they are never lost
    this.loadUsersFromDisk();

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

      // 2. Ensure Schema DDL exists in PostgreSQL
      await this.ensureSchema();

      // 3. Load existing users from PostgreSQL into memory
      await this.loadUsersFromPostgres();
    } catch (err) {
      this.isPostgresConnected = false;
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
        this.isSchemaInitialized = true;
        console.log('✅ [Database] Database schema verified and synchronized.');
      }
    } catch (err) {
      console.warn('⚠️ [Database] Schema synchronization notice (non-fatal):', err);
    }
  }

  public async loadUsersFromPostgres(): Promise<void> {
    if (!this.isPostgresConnected || !this.pool) return;
    try {
      const res = await this.pool.query('SELECT * FROM users ORDER BY created_at ASC');
      if (res && res.rows && res.rows.length > 0) {
        for (const row of res.rows) {
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
            created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          });
        }
        console.log(`📦 [Database] Loaded ${res.rows.length} permanent user accounts from PostgreSQL into memory.`);
        this.saveUsersToDisk();
      }
    } catch (err) {
      console.warn('[Database] Could not load users from PostgreSQL table:', err);
    }
  }

  public loadUsersFromDisk(): void {
    for (const f of PERSISTENT_USERS_FILES) {
      try {
        if (fs.existsSync(f)) {
          const raw = fs.readFileSync(f, 'utf-8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const u of parsed) {
              if (u && u.id && !localStore.users.has(u.id)) {
                localStore.users.set(u.id, u);
              }
            }
            if (parsed.length > 0) {
              console.log(`💾 [Database] Loaded ${parsed.length} persistent user records from disk storage.`);
            }
            break;
          }
        }
      } catch (_) {}
    }
  }

  public saveUsersToDisk(): void {
    const list = Array.from(localStore.users.values());
    for (const f of PERSISTENT_USERS_FILES) {
      try {
        const dir = path.dirname(f);
        if (fs.existsSync(dir)) {
          fs.writeFileSync(f, JSON.stringify(list, null, 2), 'utf-8');
        }
      } catch (_) {}
    }
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
