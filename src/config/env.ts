import dotenv from 'dotenv';
import path from 'path';

// Load environment file based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : '.env.development';

dotenv.config({ path: path.resolve(process.cwd(), envFile) });
// Fallback to default .env if specific doesn't exist
dotenv.config();

// Construct DATABASE_URL if individual parameters are supplied
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || '5432';
const dbUser = process.env.DB_USER || 'safaris_user';
const dbPassword = process.env.DB_PASSWORD || 'safaris_secure_password';
const dbName = process.env.DB_NAME || 'safaris_db';
const fallbackDbUrl = `postgres://${dbUser}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${dbName}`;

export const ENV = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL || fallbackDbUrl,
  
  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // Security
  JWT_SECRET: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' 
    ? (() => { throw new Error('FATAL: JWT_SECRET environment variable must be set in production.'); })() 
    : 'safaris_super_secret_jwt_key_uganda_2026'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('FATAL: REFRESH_TOKEN_SECRET environment variable must be set in production.'); })()
    : 'safaris_refresh_token_secret_uganda_2026'),
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
  
  // CORS Configuration
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // Seeding
  AUTO_SEED: process.env.AUTO_SEED !== 'false', // in development default to true, disabled in production unless explicit

  // Localization
  DEFAULT_COUNTRY: process.env.DEFAULT_COUNTRY || 'Uganda',
  DEFAULT_CURRENCY: process.env.DEFAULT_CURRENCY || 'UGX',
  PAYMENT_MOCK_MODE: process.env.PAYMENT_MOCK_MODE !== 'false',
  
  // App Remote Config
  MIN_APP_VERSION: process.env.MIN_APP_VERSION || '1.0.0',
  LATEST_APP_VERSION: process.env.LATEST_APP_VERSION || '1.0.0',
  FORCE_UPDATE: process.env.FORCE_UPDATE === 'true',
  MAINTENANCE_MODE: process.env.MAINTENANCE_MODE === 'true',
};

