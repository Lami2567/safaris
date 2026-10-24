import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

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

// SHA-256 digests of public DPO sandbox test tokens (prevents accidental use of sandbox tokens in live mode without hardcoding raw tokens)
const KNOWN_DPO_SANDBOX_TOKEN_HASHES = new Set([
  'd74943fd41f245172b1466ba74eec28ae7ed1a06d3f6b7619d7c4f24f6125598',
  '18e546e5675cbb2791ef00713073de817621f15fe98a7e12f349eb69ea5c2e8c',
  'c95bd54e841e4b2f56ad732e02cdcce7b721023835d182b771d19e3b1300f02d',
  'cc181fc3905071f74bff8f746f7af193f4887a9188064ee0a741ed5165cbea8b',
  '4bd07b0215a14b336c7546577b8853bd603cfd7fa7d718f9ab5f9ee2893046b3',
  '972e32d3b8e0d7a30d4e7b1ac6918b1f49e342d99cda0c6c8f872c58ef88c8d5',
]);

function isKnownSandboxToken(token: string): boolean {
  if (!token) return false;
  const hash = crypto.createHash('sha256').update(token.trim().toUpperCase()).digest('hex');
  return KNOWN_DPO_SANDBOX_TOKEN_HASHES.has(hash);
}

const UUID_TOKEN_REGEX = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

function isPlaceholderValue(val: string): boolean {
  if (!val) return true;
  const upper = val.trim().toUpperCase();
  return (
    upper.startsWith('YOUR_') ||
    upper.startsWith('REPLACE_') ||
    upper.startsWith('GENERATE_') ||
    upper.includes('PLACEHOLDER') ||
    upper.includes('EXAMPLE') ||
    upper === 'CHANGEME' ||
    upper === 'TODO'
  );
}

function resolveRawDpoEnvironment(): string {
  return (process.env.DPO_ENVIRONMENT || process.env.DPO_ENV || 'sandbox').trim().toLowerCase();
}

function normalizeDpoEnvironment(raw: string): 'sandbox' | 'production' {
  if (raw === 'production' || raw === 'live') {
    return 'production';
  }
  return 'sandbox';
}

export interface DpoProductionChecklist {
  liveCompanyTokenProvided: boolean;
  liveServiceTypeIdConfirmed: boolean;
  liveEndpointsVerified: boolean;
  serverCredentialsSecured: boolean;
  operatorActivationAuthorized: boolean;
  backendConfigValidated: boolean;
  sandboxValidated: boolean;
  environmentTaggingEnabled: boolean;
}

export interface DpoConfigValidationResult {
  isValid: boolean;
  environment: 'sandbox' | 'production';
  rawEnvironment: string;
  isConfigured: boolean;
  liveReady: boolean;
  sandboxReady: boolean;
  serviceTypeId: string;
  supportTicketRef: string;
  apiBaseUrl: string;
  payUrl: string;
  callbackUrl: string;
  cancelUrl: string;
  checklist: DpoProductionChecklist;
  errors: string[];
  pendingFromDpo: string[];
  message: string;
}

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
  PAYMENT_MOCK_MODE: process.env.PAYMENT_MOCK_MODE === 'true',
  
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
  // Dynamic getters ensure environment switches and test overrides are always evaluated cleanly
  get DPO_ENVIRONMENT(): 'sandbox' | 'production' {
    return normalizeDpoEnvironment(resolveRawDpoEnvironment());
  },
  get DPO_ENV(): 'sandbox' | 'production' {
    return normalizeDpoEnvironment(resolveRawDpoEnvironment());
  },
  get DPO_SUPPORT_TICKET_REF(): string {
    return (process.env.DPO_SUPPORT_TICKET_REF || '2777504').trim();
  },
  get DPO_SANDBOX_COMPANY_TOKEN(): string {
    return (process.env.DPO_SANDBOX_COMPANY_TOKEN || process.env.DPO_COMPANY_TOKEN || '').trim();
  },
  get DPO_SANDBOX_SERVICE_TYPE_ID(): string {
    return (process.env.DPO_SANDBOX_SERVICE_TYPE_ID || process.env.DPO_SERVICE_TYPE || '54841').trim();
  },
  get DPO_LIVE_COMPANY_TOKEN(): string {
    return (process.env.DPO_LIVE_COMPANY_TOKEN || (this.DPO_ENVIRONMENT === 'production' ? process.env.DPO_COMPANY_TOKEN || '' : '')).trim();
  },
  get DPO_LIVE_SERVICE_TYPE_ID(): string {
    return (process.env.DPO_LIVE_SERVICE_TYPE_ID || (this.DPO_ENVIRONMENT === 'production' ? process.env.DPO_SERVICE_TYPE || '' : '')).trim();
  },
  get DPO_LIVE_ACTIVATION_CONFIRMED(): boolean {
    return (
      (process.env.DPO_LIVE_ACTIVATION_CONFIRMED || '').trim().toLowerCase() === 'true' &&
      (process.env.LIVE_PAYMENTS_ENABLED || '').trim().toLowerCase() !== 'false'
    );
  },
  get PAYMENTS_ENABLED(): boolean {
    return (process.env.PAYMENTS_ENABLED || 'true').trim().toLowerCase() !== 'false';
  },
  get LIVE_PAYMENTS_ENABLED(): boolean {
    return (process.env.LIVE_PAYMENTS_ENABLED || 'false').trim().toLowerCase() === 'true';
  },
  get WALLET_TOPUPS_ENABLED(): boolean {
    if (process.env.WALLET_TOPUPS_ENABLED !== undefined) {
      return process.env.WALLET_TOPUPS_ENABLED.trim().toLowerCase() === 'true';
    }
    return this.DPO_ENVIRONMENT === 'sandbox';
  },
  get WALLET_CUSTODY_APPROVED(): boolean {
    return (process.env.WALLET_CUSTODY_APPROVED || 'false').trim().toLowerCase() === 'true';
  },
  get PAYOUTS_ENABLED(): boolean {
    return (process.env.PAYOUTS_ENABLED || 'false').trim().toLowerCase() === 'true';
  },
  get DEVELOPER_COMMISSION_RATE(): number {
    const val = Number(process.env.DEVELOPER_COMMISSION_RATE);
    return Number.isFinite(val) && val >= 0 && val <= 50 ? val : 5.0;
  },
  get PLATFORM_COMMISSION_RATE(): number {
    const val = Number(process.env.PLATFORM_COMMISSION_RATE);
    return Number.isFinite(val) && val >= 0 && val <= 50 ? val : 0.0;
  },
  get DPO_COMPANY_TOKEN(): string {
    // Strictly separate sandbox and live tokens; never fall back from live to sandbox or vice versa
    const env = normalizeDpoEnvironment(resolveRawDpoEnvironment());
    if (env === 'production') {
      return this.DPO_LIVE_COMPANY_TOKEN;
    }
    return this.DPO_SANDBOX_COMPANY_TOKEN;
  },
  get DPO_SERVICE_TYPE(): string {
    // Strictly separate sandbox and live service type IDs; never assume 54841 applies to production
    const env = normalizeDpoEnvironment(resolveRawDpoEnvironment());
    if (env === 'production') {
      return this.DPO_LIVE_SERVICE_TYPE_ID;
    }
    return this.DPO_SANDBOX_SERVICE_TYPE_ID;
  },
  get DPO_API_BASE_URL(): string {
    const env = normalizeDpoEnvironment(resolveRawDpoEnvironment());
    if (env === 'production' && process.env.DPO_LIVE_API_BASE_URL) {
      return process.env.DPO_LIVE_API_BASE_URL.trim();
    }
    if (env === 'sandbox' && process.env.DPO_SANDBOX_API_BASE_URL) {
      return process.env.DPO_SANDBOX_API_BASE_URL.trim();
    }
    return (process.env.DPO_API_BASE_URL || process.env.DPO_API_URL || 'https://secure.3gdirectpay.com/API/v6/').trim();
  },
  get DPO_API_URL(): string {
    return this.DPO_API_BASE_URL;
  },
  get DPO_PAY_URL(): string {
    const env = normalizeDpoEnvironment(resolveRawDpoEnvironment());
    if (env === 'production' && process.env.DPO_LIVE_PAY_URL) {
      return process.env.DPO_LIVE_PAY_URL.trim();
    }
    if (env === 'sandbox' && process.env.DPO_SANDBOX_PAY_URL) {
      return process.env.DPO_SANDBOX_PAY_URL.trim();
    }
    return (process.env.DPO_PAYMENT_URL || process.env.DPO_PAY_URL || 'https://secure.3gdirectpay.com/payv3.php').trim();
  },
  get DPO_PAYMENT_URL(): string {
    return this.DPO_PAY_URL;
  },
  get DPO_CALLBACK_URL(): string {
    return (process.env.DPO_REDIRECT_URL || process.env.DPO_CALLBACK_URL || 'https://admin.mumwesafarisuganda.com/api/v1/payments/dpo/callback').trim();
  },
  get DPO_REDIRECT_URL(): string {
    return this.DPO_CALLBACK_URL;
  },
  get DPO_CANCEL_URL(): string {
    return (process.env.DPO_CANCEL_URL || 'https://admin.mumwesafarisuganda.com/api/v1/payments/dpo/cancel').trim();
  },

  // Careers Recruitment Portal Integration (careers.mumwesafarisuganda.com)
  CAREERS_API_SECRET: process.env.CAREERS_API_SECRET || 'safaris_careers_recruitment_auth_token_2026',

  /**
   * Server-side validation of DPO Pay environment and credentials.
   * Enforces fail-closed behavior:
   * - Defaults to 'sandbox' with Service Type ID 54841 (Ticket #2777504)
   * - Rejects live/production mode unless valid live token, confirmed production service type ID,
   *   and explicit operator activation confirmation are all present.
   * - Never falls back from live to sandbox or from sandbox to live.
   */
  validateDpoConfig: (targetEnvOverride?: string): DpoConfigValidationResult => {
    const rawEnv = (targetEnvOverride ?? resolveRawDpoEnvironment()).trim().toLowerCase();
    const errors: string[] = [];
    const pendingFromDpo: string[] = [];

    if (rawEnv !== 'sandbox' && rawEnv !== 'production' && rawEnv !== 'live') {
      errors.push(`Invalid DPO_ENVIRONMENT "${rawEnv}". Allowed values are "sandbox" or "production" ("live").`);
    }

    const env: 'sandbox' | 'production' = normalizeDpoEnvironment(rawEnv);

    const sandboxToken = ENV.DPO_SANDBOX_COMPANY_TOKEN;
    const sandboxServiceType = ENV.DPO_SANDBOX_SERVICE_TYPE_ID;
    const supportTicketRef = (process.env.DPO_SUPPORT_TICKET_REF || '2777504').trim();

    const liveToken = (process.env.DPO_LIVE_COMPANY_TOKEN || '').trim();
    const liveServiceType = (process.env.DPO_LIVE_SERVICE_TYPE_ID || '').trim();
    const liveActivationConfirmed = (process.env.DPO_LIVE_ACTIVATION_CONFIRMED || '').trim().toLowerCase() === 'true';

    const apiBaseUrl = ENV.DPO_API_BASE_URL;
    const payUrl = ENV.DPO_PAY_URL;
    const callbackUrl = ENV.DPO_CALLBACK_URL;
    const cancelUrl = ENV.DPO_CANCEL_URL;

    // Validate Sandbox Readiness
    const sandboxTokenValid =
      Boolean(sandboxToken) &&
      !isPlaceholderValue(sandboxToken) &&
      UUID_TOKEN_REGEX.test(sandboxToken);
    const sandboxServiceTypeValid = Boolean(sandboxServiceType) && /^\d+$/.test(sandboxServiceType);
    const sandboxReady = sandboxTokenValid && sandboxServiceTypeValid;

    // Validate Live Production Checklist
    const liveTokenIsSandbox = isKnownSandboxToken(liveToken) || (Boolean(sandboxToken) && liveToken.toUpperCase() === sandboxToken.toUpperCase());
    const liveCompanyTokenProvided =
      Boolean(liveToken) &&
      !isPlaceholderValue(liveToken) &&
      UUID_TOKEN_REGEX.test(liveToken) &&
      !liveTokenIsSandbox;

    if (!liveCompanyTokenProvided) {
      pendingFromDpo.push('Live DPO Company Token (DPO_LIVE_COMPANY_TOKEN) has not yet been supplied by DPO.');
    }

    // Do not assume sandbox service type ID 54841 applies to production
    const allowSameServiceTypeInLive = (process.env.DPO_LIVE_SERVICE_TYPE_CONFIRMED_SAME || '').trim().toLowerCase() === 'true';
    const liveServiceTypeIdConfirmed =
      Boolean(liveServiceType) &&
      !isPlaceholderValue(liveServiceType) &&
      /^\d+$/.test(liveServiceType) &&
      (liveServiceType !== '54841' || allowSameServiceTypeInLive);

    if (!liveServiceTypeIdConfirmed) {
      pendingFromDpo.push('Production DPO Service Type ID (DPO_LIVE_SERVICE_TYPE_ID) must be confirmed by DPO (cannot assume sandbox ID 54841).');
    }

    const liveEndpointsVerified =
      apiBaseUrl.startsWith('https://') &&
      payUrl.startsWith('https://') &&
      callbackUrl.startsWith('https://') &&
      cancelUrl.startsWith('https://');

    const serverCredentialsSecured = env === 'production'
      ? liveCompanyTokenProvided && !isPlaceholderValue(liveToken)
      : sandboxTokenValid && !isPlaceholderValue(sandboxToken);

    const checklist: DpoProductionChecklist = {
      liveCompanyTokenProvided,
      liveServiceTypeIdConfirmed,
      liveEndpointsVerified,
      serverCredentialsSecured,
      operatorActivationAuthorized: liveActivationConfirmed,
      backendConfigValidated: false, // set below
      sandboxValidated: sandboxReady,
      environmentTaggingEnabled: true,
    };

    const liveReady =
      checklist.liveCompanyTokenProvided &&
      checklist.liveServiceTypeIdConfirmed &&
      checklist.liveEndpointsVerified &&
      checklist.operatorActivationAuthorized;

    checklist.backendConfigValidated = env === 'production' ? liveReady : sandboxReady;

    if (env === 'sandbox') {
      if (!sandboxToken) {
        errors.push('DPO_SANDBOX_COMPANY_TOKEN is not configured for sandbox environment.');
      } else if (isPlaceholderValue(sandboxToken) || !UUID_TOKEN_REGEX.test(sandboxToken)) {
        errors.push('DPO_SANDBOX_COMPANY_TOKEN is invalid or contains a placeholder value.');
      }
      if (!sandboxServiceTypeValid) {
        errors.push(`DPO_SANDBOX_SERVICE_TYPE_ID "${sandboxServiceType}" is invalid. Expected numeric ID (54841).`);
      }
    } else if (env === 'production') {
      if (!liveToken) {
        errors.push('Live payments disabled: DPO_LIVE_COMPANY_TOKEN has not been configured.');
      } else if (liveTokenIsSandbox) {
        errors.push('Live payments rejected: DPO_LIVE_COMPANY_TOKEN matches a sandbox test token. Never use sandbox credentials in production.');
      } else if (isPlaceholderValue(liveToken) || !UUID_TOKEN_REGEX.test(liveToken)) {
        errors.push('Live payments rejected: DPO_LIVE_COMPANY_TOKEN is invalid or contains a placeholder.');
      }

      if (!liveServiceType) {
        errors.push('Live payments disabled: DPO_LIVE_SERVICE_TYPE_ID has not been configured.');
      } else if (liveServiceType === '54841' && !allowSameServiceTypeInLive) {
        errors.push('Live payments rejected: DPO_LIVE_SERVICE_TYPE_ID is set to sandbox ID 54841 without explicit DPO confirmation.');
      } else if (isPlaceholderValue(liveServiceType) || !/^\d+$/.test(liveServiceType)) {
        errors.push('Live payments rejected: DPO_LIVE_SERVICE_TYPE_ID must be a confirmed numeric service type ID.');
      }

      if (!liveEndpointsVerified) {
        errors.push('Live payments rejected: All DPO API, payment, callback, and cancel URLs must use HTTPS.');
      }

      if (!liveActivationConfirmed) {
        errors.push('Live payments disabled: Operator has not explicitly authorized production activation (DPO_LIVE_ACTIVATION_CONFIRMED=true).');
      }

      if (process.env.DPO_REJECT_UNAUTHORIZED === 'false' && env === 'production') {
        errors.push('Live payments rejected: TLS certificate verification cannot be disabled in production (DPO_REJECT_UNAUTHORIZED).');
      }
    }

    const isValid = errors.length === 0;
    const activeServiceType = env === 'production' ? liveServiceType : sandboxServiceType;

    return {
      isValid,
      environment: env,
      rawEnvironment: rawEnv,
      isConfigured: isValid,
      liveReady,
      sandboxReady,
      serviceTypeId: activeServiceType,
      supportTicketRef,
      apiBaseUrl,
      payUrl,
      callbackUrl,
      cancelUrl,
      checklist,
      errors,
      pendingFromDpo,
      message: isValid
        ? `DPO Pay configured for ${env.toUpperCase()} mode (ServiceType: ${activeServiceType}, Ticket: #${supportTicketRef}).`
        : errors.join(' '),
    };
  },
};



