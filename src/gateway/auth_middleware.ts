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
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : undefined;

  const rawToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : queryToken;

  if (rawToken) {
    try {
      const payload = jwt.verify(rawToken, ENV.JWT_SECRET) as AuthUserPayload;

      // Reject non-access scoped tokens (e.g., setup_password, recruitment)
      if (payload.scope && payload.scope !== 'access') {
        return sendError(
          res,
          'INVALID_TOKEN_SCOPE',
          `Tokens with scope '${payload.scope}' cannot be used for general API access.`,
          403
        );
      }

      // Live user validation: look up in authoritative store, check suspension, token version, and role
      if (payload.userId) {
        const liveUser = await db.getUserById(payload.userId);
        if (!liveUser) {
          return sendError(res, 'USER_NOT_FOUND', 'User account does not exist or has been removed.', 401);
        }

        if (liveUser.approval_status === 'SUSPENDED') {
          return sendError(res, 'ACCOUNT_SUSPENDED', 'Your account has been suspended. Please contact support.', 403);
        }

        // Check token revocation version
        const tokenVer = Number(payload.tokenVersion ?? 1);
        const userVer = Number(liveUser.token_version ?? 1);
        if (tokenVer < userVer) {
          return sendError(
            res,
            'SESSION_REVOKED',
            'Session has been invalidated due to a security update or password change. Please log in again.',
            401
          );
        }

        // If token claims elevated privileges but live user role has changed/been revoked
        if (payload.role !== liveUser.role) {
          const wasPrivileged = ['admin', 'driver', 'tour_guide'].includes(payload.role);
          const isPrivileged = ['admin', 'driver', 'tour_guide'].includes(liveUser.role);
          if (wasPrivileged || isPrivileged) {
            return sendError(
              res,
              'PRIVILEGES_REVOKED',
              'Your account role or permissions have been updated. Please log in again to continue.',
              403
            );
          }
          payload.role = liveUser.role;
        }
      }

      req.user = payload;
      return next();
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        return sendError(res, 'TOKEN_EXPIRED', 'Your session token has expired. Please log in again.', 401);
      }
      return sendError(res, 'INVALID_TOKEN', 'Malformed or invalid authentication token.', 401);
    }
  }

  // Fallback for pre-configuration admin bootstrap ONLY in non-production environments
  const isAdminLoginEnforced = AdminService.isAdminAuthConfiguredSync();
  if (process.env.NODE_ENV !== 'production' && !isAdminLoginEnforced && process.env.ADMIN_ACCESS_KEY && process.env.ADMIN_ACCESS_KEY.trim()) {
    const adminKey = req.headers['x-admin-key'] || req.query?.adminKey;
    if (adminKey && adminKey === process.env.ADMIN_ACCESS_KEY.trim()) {
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
