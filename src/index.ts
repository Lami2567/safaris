import http from 'http';
import express from 'express';
import cors from 'cors';
import { ENV } from './config/env';
import { requestLogger } from './gateway/logger';
import { rateLimiter } from './gateway/rate_limiter';
import { apiRouter } from './gateway/routes';
import { initSocketServer } from './realtime/socket_server';
import { seedUgandaData } from './database/seed';

const app = express();
const server = http.createServer(app);

// Enable Cross-Origin Resource Sharing for Flutter Web / Mobile apps
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Gateway Middlewares
app.use(requestLogger);
app.use(rateLimiter);

// Mount API Gateway routes under /api/v1
app.use('/api/v1', apiRouter);

// Initialize Real-Time WebSockets
initSocketServer(server);

// Seed local development data
seedUgandaData().then(() => {
  server.listen(ENV.PORT, '0.0.0.0', () => {
    console.log('====================================================');
    console.log(`🚀 SAFARIS Backend Server Running on Port ${ENV.PORT}`);
    console.log(`📡 Environment: ${ENV.NODE_ENV}`);
    console.log(`🌐 Base API URL: http://localhost:${ENV.PORT}/api/v1`);
    console.log(`⚡ WebSocket Hub: ws://localhost:${ENV.PORT}`);
    console.log('====================================================');
  });
});
