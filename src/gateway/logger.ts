import { Request, Response, NextFunction } from 'express';

const SENSITIVE_QUERY_KEYS = /^(trans(action)?token|companytoken|token|card|pan|cvv|pin|otp|ccdapproval|password|secret|statusToken|setupToken|application-status)$/i;

function sanitizeUrlPath(rawUrl: string): string {
  if (!rawUrl || !rawUrl.includes('?')) return rawUrl;
  const [basePath, queryString] = rawUrl.split('?', 2);
  const sanitizedParams = queryString
    .split('&')
    .map((pair) => {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) return pair;
      const key = decodeURIComponent(pair.slice(0, eqIdx));
      if (SENSITIVE_QUERY_KEYS.test(key)) {
        return `${pair.slice(0, eqIdx)}=[REDACTED]`;
      }
      return pair;
    })
    .join('&');
  return `${basePath}?${sanitizedParams}`;
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 10);

  // Attach requestId to request
  (req as any).requestId = requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const safePath = sanitizeUrlPath(req.originalUrl || req.url);
    const logData = {
      requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: safePath,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip || req.socket.remoteAddress,
    };

    console.log(`[REQ] ${logData.timestamp} | ${logData.method} ${logData.path} | ${logData.status} | ${logData.durationMs}ms`);
  });

  next();
}
