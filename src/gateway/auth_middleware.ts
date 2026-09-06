import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { sendError } from '../shared/response';

export interface AuthUserPayload {
  userId: string;
  role: string;
  phone: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'UNAUTHORIZED', 'Authentication token missing or invalid.', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, ENV.JWT_SECRET) as AuthUserPayload;
    req.user = payload;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 'TOKEN_EXPIRED', 'Your session token has expired.', 401);
    }
    return sendError(res, 'INVALID_TOKEN', 'Malformed or invalid authentication token.', 401);
  }
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
