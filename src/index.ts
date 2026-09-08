import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ENV } from './config/env';
import { db } from './config/database';
import { requestLogger } from './gateway/logger';
import { rateLimiter } from './gateway/rate_limiter';
import { apiRouter } from './gateway/routes';
import { initSocketServer } from './realtime/socket_server';
import { seedUgandaData } from './database/seed';

const app = express();
const server = http.createServer(app);

// Security Headers
app.use(helmet({ contentSecurityPolicy: false }));

// Configure Cross-Origin Resource Sharing
const allowedOrigins = ENV.CORS_ORIGIN === '*'
  ? '*'
  : ENV.CORS_ORIGIN.split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Flutter mobile apps and curl requests have no origin header
    if (!origin || allowedOrigins === '*' || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS policy does not allow access from the specified Origin.'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Gateway Middlewares
app.use(requestLogger);
app.use(rateLimiter);

// -------------------------------------------------------------
// Root Liveness & Readiness Health Checks
// -------------------------------------------------------------
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    platform: 'SAFARIS Uganda API Gateway',
    environment: ENV.NODE_ENV,
    timestamp: new Date().toISOString(),
    version: '1.0.1',
  });
});

app.get('/health/ready', async (req, res) => {
  const dbStatus = db.isPostgresConnected ? 'connected' : 'in-memory-fallback';
  res.status(200).json({
    status: 'ok',
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// Mount API Gateway routes under /api/v1
app.use('/api/v1', apiRouter);

// Initialize Real-Time WebSockets
initSocketServer(server);

// Start Server with safe seeding lifecycle
async function startServer() {
  if (ENV.AUTO_SEED) {
    try {
      await seedUgandaData();
    } catch (err) {
      console.warn('⚠️ Seeding skipped or encountered non-fatal error:', err);
    }
  } else {
    console.log('🔒 Automatic seeding disabled by configuration.');
  }

  server.listen(ENV.PORT, '0.0.0.0', () => {
    console.log('====================================================');
    console.log(`🚀 SAFARIS Backend Server Running on Port ${ENV.PORT}`);
    console.log(`📡 Environment: ${ENV.NODE_ENV}`);
    console.log(`🌐 Base API URL: http://0.0.0.0:${ENV.PORT}/api/v1`);
    console.log(`⚡ WebSocket Hub: ws://0.0.0.0:${ENV.PORT}`);
    console.log('====================================================');
  });
}

startServer();

