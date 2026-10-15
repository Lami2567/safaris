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
  CONFIG_ENCRYPTION_SECRET: process.env.CONFIG_ENCRYPTION_SECRET || process.env.JWT_SECRET || 'safaris_config_encryption_key_2026_uganda_32b',
  
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

  // Email & SMTP Configuration for OTPs
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'SAFARIS Uganda <no-reply@mumwesafarisuganda.com>',
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',

  // Mapbox Configuration
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN || process.env.MAPBOX_KEY || '',

  // Cloudflare R2 Object Storage (Zero server bandwidth uploads/downloads)
  CLOUDFLARE_R2_ACCOUNT_ID: process.env.CLOUDFLARE_R2_ACCOUNT_ID || '',
  CLOUDFLARE_R2_ACCESS_KEY_ID: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
  CLOUDFLARE_R2_BUCKET_NAME: process.env.CLOUDFLARE_R2_BUCKET_NAME || '',
  CLOUDFLARE_R2_PUBLIC_URL: process.env.CLOUDFLARE_R2_PUBLIC_URL || '',
  CLOUDFLARE_R2_REGION: process.env.CLOUDFLARE_R2_REGION || 'auto',

  // DPO Pay (Direct Pay Online) Official Gateway Configuration
  DPO_ENVIRONMENT: (process.env.DPO_ENVIRONMENT || process.env.DPO_ENV || 'sandbox').toLowerCase() as 'sandbox' | 'production',
  DPO_ENV: (process.env.DPO_ENVIRONMENT || process.env.DPO_ENV || 'sandbox').toLowerCase() as 'sandbox' | 'production',
  DPO_COMPANY_TOKEN: process.env.DPO_COMPANY_TOKEN || '',
  DPO_SERVICE_TYPE: process.env.DPO_SERVICE_TYPE || '5525',
  DPO_API_BASE_URL: process.env.DPO_API_BASE_URL || process.env.DPO_API_URL || 'https://secure.3gdirectpay.com/API/v6/',
  DPO_API_URL: process.env.DPO_API_BASE_URL || process.env.DPO_API_URL || 'https://secure.3gdirectpay.com/API/v6/',
  DPO_PAY_URL: process.env.DPO_PAY_URL || 'https://secure.3gdirectpay.com/payv3.php',
  DPO_CALLBACK_URL: process.env.DPO_CALLBACK_URL || 'https://admin.mumwesafarisuganda.com/api/v1/payments/dpo/callback',
  DPO_CANCEL_URL: process.env.DPO_CANCEL_URL || 'https://admin.mumwesafarisuganda.com/api/v1/payments/dpo/cancel',

  // Careers Recruitment Portal Integration (careers.mumwesafarisuganda.com)
  CAREERS_API_SECRET: process.env.CAREERS_API_SECRET || 'safaris_careers_recruitment_auth_token_2026',

  // Validation method to verify environment configuration
  validateDpoConfig: (): { isValid: boolean; environment: string; isConfigured: boolean; message: string } => {
    const env = (process.env.DPO_ENVIRONMENT || process.env.DPO_ENV || 'sandbox').toLowerCase();
    const token = (process.env.DPO_COMPANY_TOKEN || '').trim();
    const serviceType = (process.env.DPO_SERVICE_TYPE || '5525').trim();

    if (env !== 'sandbox' && env !== 'production') {
      return {
        isValid: false,
        environment: env,
        isConfigured: false,
        message: `Invalid DPO_ENVIRONMENT: "${env}". Allowed values are "sandbox" or "production".`,
      };
    }

    if (!token) {
      return {
        isValid: false,
        environment: env,
        isConfigured: false,
        message: `DPO_COMPANY_TOKEN is not configured for ${env} environment.`,
      };
    }

    return {
      isValid: true,
      environment: env,
      isConfigured: true,
      message: `DPO Pay configured for ${env} with ServiceType ${serviceType}.`,
    };
  },
};


