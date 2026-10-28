import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { sendError } from '../shared/response';
import { AdminService } from '../services/admin/admin.service';
import { db, localStore } from '../config/database';

export interface AuthUserPayload {
  userId: string;
  role: string;
  phone: string;
  email: string;
  username?: string;
  adminAuth?: boolean;
  authVersion?: string;
  tokenVersion?: number;
  scope?: string;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
  liveUser?: any;
}

export interface AuthValidationResult {
  valid: boolean;
  user?: any;
  payload?: AuthUserPayload;
  error?: string;
  code?: string;
  status?: number;
}

/**
 * Validates a JWT session token across HTTP, WebSockets, and SSE transports.
 * Verifies signature, expiration, scope, live account suspension, token_version, and role integrity.
 */
export async function validateAuthSession(rawToken: string): Promise<AuthValidationResult> {
  if (!rawToken || typeof rawToken !== 'string') {
    return { valid: false, error: 'Authentication token missing or invalid.', code: 'UNAUTHORIZED', status: 401 };
  }

  try {
    const payload = jwt.verify(rawToken, ENV.JWT_SECRET, { algorithms: ['HS256'] }) as AuthUserPayload;

    // Reject non-access scoped tokens (e.g., setup_password, recruitment)
    if (payload.scope !== 'access' || !payload.userId || !payload.role || !Number.isFinite(payload.exp)) {
      return {
        valid: false,
        error: `Tokens with scope '${payload.scope}' cannot be used for general API access.`,
        code: 'INVALID_TOKEN_SCOPE',
        status: 403,
      };
    }

    // Live user validation: look up in authoritative store, check suspension, token version, and role
    if (payload.userId) {
      const liveUser = await db.getUserById(payload.userId);
      if (!liveUser) {
        return { valid: false, error: 'User account does not exist or has been removed.', code: 'USER_NOT_FOUND', status: 401 };
      }

      if (liveUser.approval_status && liveUser.approval_status !== 'APPROVED') {
        return { valid: false, error: 'Your account has been suspended. Please contact support.', code: 'ACCOUNT_SUSPENDED', status: 403 };
      }

      // Check token revocation version
      const tokenVer = Number(payload.tokenVersion ?? 1);
      const userVer = Number(liveUser.token_version ?? 1);
      if (!Number.isInteger(tokenVer) || tokenVer !== userVer) {
        return {
          valid: false,
          error: 'Session has been invalidated due to a security update or password change. Please log in again.',
          code: 'SESSION_REVOKED',
          status: 401,
        };
      }

      // If token claims elevated privileges but live user role has changed/been revoked
      if (payload.role !== liveUser.role) {
        const wasPrivileged = ['admin', 'driver', 'tour_guide'].includes(payload.role);
        const isPrivileged = ['admin', 'driver', 'tour_guide'].includes(liveUser.role);
        if (wasPrivileged || isPrivileged) {
          return {
            valid: false,
            error: 'Your account role or permissions have been updated. Please log in again to continue.',
            code: 'PRIVILEGES_REVOKED',
            status: 403,
          };
        }
        payload.role = liveUser.role;
      }

      return { valid: true, user: liveUser, payload };
    }

    return { valid: false, code: 'INVALID_TOKEN', error: 'Required token claims missing.', status: 401 };
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return { valid: false, error: 'Your session token has expired. Please log in again.', code: 'TOKEN_EXPIRED', status: 401 };
    }
    return { valid: false, error: 'Malformed or invalid authentication token.', code: 'INVALID_TOKEN', status: 401 };
  }
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : undefined;

  const rawToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : queryToken;

  if (rawToken) {
    const val = await validateAuthSession(rawToken);
    if (!val.valid) {
      return sendError(res, val.code || 'UNAUTHORIZED', val.error || 'Authentication failed', val.status || 401);
    }
    req.user = val.payload;
    req.liveUser = val.user;
    res.locals.accessToken = rawToken;
    return next();
  }

  // Fallback for pre-configuration admin bootstrap when credentials have not been configured
  const isAdminLoginEnforced = AdminService.isAdminAuthConfiguredSync();
  const expectedAdminKey = (process.env.ADMIN_ACCESS_KEY || process.env.ADMIN_KEY || 'mumwe_safaris_secret_jwt_2026').trim();
  if (!isAdminLoginEnforced && expectedAdminKey) {
    const adminKey = req.headers['x-admin-key'] || req.query?.adminKey;
    if (adminKey && adminKey === expectedAdminKey) {
      req.user = {
        userId: 'usr_adm_001',
        role: 'admin',
        phone: '+256 700 000001',
        email: 'admin@safaris.ug',
        adminAuth: true,
      };
      return next();
    }
  }

  return sendError(res, 'UNAUTHORIZED', 'Authentication token missing or invalid.', 401);
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
    }

    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'admin') {
      return sendError(res, 'FORBIDDEN', `Access restricted to ${allowedRoles.join(' or ')} accounts.`, 403);
    }

    next();
  };
}
