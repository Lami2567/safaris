import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 10);

  // Attach requestId to request
  (req as any).requestId = requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip || req.socket.remoteAddress,
    };

    console.log(`[REQ] ${logData.timestamp} | ${logData.method} ${logData.path} | ${logData.status} | ${logData.durationMs}ms`);
  });

  next();
}
