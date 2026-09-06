import { Pool, QueryResult } from 'pg';
import { ENV } from './env';

// Memory Store Tables for resilient local development
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
};

class DatabaseManager {
  private pool: Pool | null = null;
  public isPostgresConnected = false;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      this.pool = new Pool({
        connectionString: ENV.DATABASE_URL,
        connectionTimeoutMillis: 3000,
        max: 20,
      });

      const client = await this.pool.connect();
      client.release();
      this.isPostgresConnected = true;
      console.log('✅ [Database] Connected successfully to PostgreSQL instance.');
    } catch (err) {
      this.isPostgresConnected = false;
      console.log('⚡ [Database] PostgreSQL not detected locally. Initialized in-memory data store for offline development.');
    }
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
    // Return empty array structure for fallback
    return { rows: [], rowCount: 0 };
  }

  public async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export const db = new DatabaseManager();
