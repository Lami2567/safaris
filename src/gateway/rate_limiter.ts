import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../config/database';
import { sendError } from '../shared/response';
import { normalizeUgandaPhone } from '../shared/phone';

const testCounters = new Map<string, { count: number; resetAt: number }>();
let checks = 0;
export async function consumeRateLimit(key: string, limit: number, windowMs: number): Promise<number> {
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  if (db.isPostgresConnected) {
    // One SQL statement serializes increments across processes. Database time owns expiry.
    const row = (await db.query(`INSERT INTO security_rate_limits AS current(key_hash, count, expires_at)
      VALUES ($1, 1, CURRENT_TIMESTAMP + $2 * interval '1 millisecond')
      ON CONFLICT (key_hash) DO UPDATE SET
        count = CASE WHEN current.expires_at <= CURRENT_TIMESTAMP THEN 1 ELSE LEAST(current.count + 1, $3 + 1) END,
        expires_at = CASE WHEN current.expires_at <= CURRENT_TIMESTAMP THEN EXCLUDED.expires_at ELSE current.expires_at END
      RETURNING count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - CURRENT_TIMESTAMP)))) AS retry_after`, [hash, windowMs, limit])).rows[0];
    if (++checks % 64 === 0) await db.query(`DELETE FROM security_rate_limits WHERE key_hash IN
      (SELECT key_hash FROM security_rate_limits WHERE expires_at < CURRENT_TIMESTAMP ORDER BY expires_at LIMIT 1000)`);
    return Number(row.count) > limit ? Number(row.retry_after) : 0;
  }
  if (process.env.NODE_ENV !== 'test') throw new Error('Rate limit storage unavailable.');
  const now = Date.now();
  for (const [k, r] of testCounters) if (r.resetAt <= now) testCounters.delete(k);
  if (!testCounters.has(hash) && testCounters.size >= 10000) return Math.ceil(windowMs / 1000);
  const record = testCounters.get(hash) || { count: 0, resetAt: now + windowMs };
  record.count = Math.min(record.count + 1, limit + 1); testCounters.set(hash, record);
  return record.count > limit ? Math.max(1, Math.ceil((record.resetAt - now) / 1000)) : 0;
}
function reject(res: Response, retry: number) {
  res.setHeader('Retry-After', String(retry));
  return sendError(res, 'RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again later.', 429);
}
export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  if (['/health', '/health/ready'].includes(req.path)) return next();
  try {
    const retry = await consumeRateLimit(`gateway:${req.ip || req.socket.remoteAddress}`, 120, 60000);
    if (retry) return reject(res, retry);
    next();
  } catch { return sendError(res, 'SECURITY_STORAGE_UNAVAILABLE', 'Please try again shortly.', 503); }
}
export async function authenticationRateLimiter(req: Request, res: Response, next: NextFunction) {
  const route = req.path.replace(/^\/api\/v1/, '');
  const sensitive = /^\/(auth\/(login|login-with-otp|verify-email-otp|resend-email-otp|setup-password|register)|admin\/login|careers\/(status|status-link))$/.test(route);
  if (!sensitive || req.method !== 'POST') return next();
  const raw = req.body?.email || req.body?.identifier || req.body?.phone || req.body?.username || '';
  const value = typeof raw === 'string' ? raw.trim().toLowerCase().slice(0, 320) : '';
  const account = value.includes('@') ? value : normalizeUgandaPhone(value) || value;
  const limit = /resend|status-link/.test(route) ? 3 : 10;
  const family = /login|verify-email-otp|setup-password/.test(route) ? 'authentication' : route;
  try {
    const ipRetry = await consumeRateLimit(`auth-ip:${req.ip}`, 30, 15 * 60000);
    const accountRetry = account ? await consumeRateLimit(`auth-account:${family}:${account}`, limit, 15 * 60000) : 0;
    if (ipRetry || accountRetry) return reject(res, Math.max(ipRetry, accountRetry));
    next();
  } catch { return sendError(res, 'SECURITY_STORAGE_UNAVAILABLE', 'Please try again shortly.', 503); }
}
