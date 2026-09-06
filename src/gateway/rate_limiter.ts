import { Request, Response, NextFunction } from 'express';
import { sendError } from '../shared/response';

interface RateRecord {
  count: number;
  resetAt: number;
}

const windowMs = 60 * 1000; // 1 minute
const maxRequests = 120; // 120 requests per minute
const ipRecords = new Map<string, RateRecord>();

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = (req.ip || req.socket.remoteAddress || 'unknown') as string;
  const now = Date.now();
  const record = ipRecords.get(ip);

  if (!record || now > record.resetAt) {
    ipRecords.set(ip, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (record.count >= maxRequests) {
    return sendError(
      res,
      'RATE_LIMIT_EXCEEDED',
      'Too many requests. Please slow down and try again later.',
      429,
      { retryAfterMs: record.resetAt - now }
    );
  }

  record.count += 1;
  next();
}
