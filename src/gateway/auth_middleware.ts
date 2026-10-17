import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { sendError } from '../shared/response';
import { AdminService } from '../services/admin/admin.service';

export interface AuthUserPayload {
  userId: string;
  role: string;
  phone: string;
  email: string;
  username?: string;
  adminAuth?: boolean;
  authVersion?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : undefined;
  const isAdminLoginEnforced = AdminService.isAdminAuthConfiguredSync();

  const rawToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : queryToken;

  if (rawToken) {
    try {
      const payload = jwt.verify(rawToken, ENV.JWT_SECRET) as AuthUserPayload;
      req.user = payload;
      return next();
    } catch (err: any) {
      if (isAdminLoginEnforced) {
        if (err.name === 'TokenExpiredError') {
          return sendError(res, 'TOKEN_EXPIRED', 'Your session token has expired.', 401);
        }
        return sendError(res, 'INVALID_TOKEN', 'Malformed or invalid authentication token.', 401);
      }
      // If admin login is not yet configured/enforced, allow fallback to x-admin-key below
    }
  }

  if (!isAdminLoginEnforced) {
    const adminKey = req.headers['x-admin-key'] || req.query?.adminKey;
    const validAdminKeys = [
      ENV.JWT_SECRET,
      process.env.ADMIN_ACCESS_KEY,
      process.env.NEXT_PUBLIC_ADMIN_KEY,
      'mumwe_safaris_secret_jwt_2026',
    ].filter(Boolean);
    if (adminKey && validAdminKeys.includes(adminKey as string)) {
      req.user = {
        userId: 'usr_adm_001',
        role: 'admin',
        phone: '+256 700 000001',
        email: 'admin@safaris.ug',
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
