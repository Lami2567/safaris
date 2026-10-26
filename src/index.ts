import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ENV } from './config/env';
import { db } from './config/database';
import { requestLogger } from './gateway/logger';
import { configureTrustedProxy } from './gateway/trusted_proxy';
import { rateLimiter, authenticationRateLimiter } from './gateway/rate_limiter';
import { apiRouter } from './gateway/routes';
import { initSocketServer } from './realtime/socket_server';
import { seedUgandaData } from './database/seed';
import { FleetMovementEngine } from './services/driver/fleet_movement_engine';

const app = express();
const trustedProxy = configureTrustedProxy(app);
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

// Limit requests before allocating or parsing upload bodies.
app.use(rateLimiter);
const normalJson = express.json({ limit: '512kb' });
const uploadJson = express.json({ limit: '28mb' });
app.use((req, res, next) => {
  const upload = req.method === 'POST' && ['/api/v1/careers/apply', '/api/v1/storage/upload'].includes(req.path);
  return (upload ? uploadJson : normalJson)(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(express.text({ type: ['application/xml', 'text/xml'], limit: '2mb' }));
app.use(requestLogger);
app.use(authenticationRateLimiter);

// -------------------------------------------------------------
// Root Liveness & Readiness Health Checks
// -------------------------------------------------------------
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    commit: process.env.SAFARIS_RELEASE_SHA || 'development',
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
    commit: process.env.SAFARIS_RELEASE_SHA || 'development',
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

import { AppConfigService } from './services/app_config/app_config.service';
import { TourismService } from './services/tourism/tourism.service';
import { TourGuideService } from './services/tour_guide/tour_guide.service';
import { PricingEngineService } from './services/pricing/pricing_engine.service';
import { PaymentService } from './services/payment/payment.service';
import { FinancialService } from './services/financial/financial.service';
import { FinancialOutboxService } from './services/financial/outbox.service';
import { ReconciliationService } from './services/financial/reconciliation.service';

// Mount API Gateway routes under /api/v1
app.use('/api/v1', apiRouter);

// Initialize Real-Time WebSockets
initSocketServer(server);

// Start Server with safe seeding lifecycle
async function startServer() {
  await trustedProxy.refresh();
  // Ensure database connection is established
  try {
    await db.waitForReady();
  } catch (err) {
    console.warn('⚠️ Non-fatal error waiting for database ready:', err);
  }

  // Load persistent configurations, destinations, packages, and tour guides
  try {
    await PricingEngineService.init();
    await AppConfigService.init();
    await TourismService.init();
    await TourGuideService.init();
    PaymentService.startReconciler();
    await FinancialService.ensureDefaultRefundPolicy();
    FinancialService.startRefundScheduler();
    FinancialOutboxService.registerHandler('DPO_VERIFY_PAYMENT', async (job) => {
      if (job.payload?.paymentId) {
        await PaymentService.verifyPayment(job.payload.paymentId, { source: 'reconciler' });
      }
    });
    FinancialOutboxService.registerHandler('RUN_RECONCILIATION', async (job) => {
      await ReconciliationService.runReconciliation(job.payload?.environment || ENV.DPO_ENVIRONMENT);
    });
    FinancialOutboxService.startWorker();
    console.log('✅ Persistent configurations, tourism records, and tour guides loaded.');
    console.log(`💳 DPO Pay Reconciler started (${ENV.DPO_ENVIRONMENT.toUpperCase()} mode).`);
    console.log('💰 Financial Engine initialized with default No-Show Refund Policy and background scheduler.');
  } catch (err) {
    console.warn('⚠️ Non-fatal error during service initialization:', err);
  }

  if (ENV.AUTO_SEED) {
    try {
      await seedUgandaData();
    } catch (err) {
      console.warn('⚠️ Seeding skipped or encountered non-fatal error:', err);
    }
  } else {
    console.log('🔒 Automatic seeding disabled by configuration.');
  }

  // Fleet movement simulation disabled to ensure only real driver updates are tracked.
  // FleetMovementEngine.getInstance().start();

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

