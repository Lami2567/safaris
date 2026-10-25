import assert from 'assert/strict';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { io as connect } from 'socket.io-client';
import { apiRouter } from '../gateway/routes';
import { db, localStore } from '../config/database';
import { ENV } from '../config/env';
import { initSocketServer } from '../realtime/socket_server';
import { AuthService } from '../services/auth/auth.service';
import { PricingEngineService } from '../services/pricing/pricing_engine.service';
import { commitBooking } from '../services/pricing/booking_commit';
import { LedgerService } from '../services/financial/ledger.service';

async function run() {
  await db.waitForReady();
  const user = { id: 'boundary_customer', role: 'customer', email: 'boundary@example.invalid',
    token_version: 1, approval_status: 'APPROVED', is_verified: true };
  localStore.users.set(user.id, user);
  const token = AuthService.generateTokens(user).accessToken;
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app);
  const sockets = initSocketServer(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    const privateUrl = '/api/v1/storage/private-url?key=private/recruitment/another-person/id.pdf';
    assert.equal((await fetch(base + privateUrl)).status, 401);
    assert.equal((await fetch(base + privateUrl, { headers })).status, 403);
    const missingRoute = await fetch(base + '/api/v1/pricing/quote', {
      method: 'POST', headers, body: JSON.stringify({ serviceType: 'RIDE', distanceKm: 0.1, customerId: 'victim' }),
    });
    assert.equal(missingRoute.status, 400);
    const badClaims = jwt.sign({ role: 'admin', scope: 'access' }, ENV.JWT_SECRET, { expiresIn: '1h' });
    assert.equal((await fetch(base + '/api/v1/admin/users', { headers: { Authorization: `Bearer ${badClaims}` } })).status, 403);

    const quote = { id: 'boundary_quote', service_type: 'RIDE', customer_id: user.id,
      consumed: false, expires_at: new Date(Date.now() + 60000).toISOString(),
      request_params: { pickupLat: 0, pickupLng: 0, destLat: 0, destLng: 1 }, total_price_ugx: 1000 };
    localStore.price_quotations.set(quote.id, quote);
    const validate = (storedQuote: any) => PricingEngineService.validateQuotation({
      quotationId: quote.id, expectedServiceType: 'RIDE', customerId: user.id,
      pickupLat: 0, pickupLng: 0, destLat: 0, destLng: 1, storedQuote,
    });
    const results = await Promise.allSettled([1, 2].map(i => commitBooking('trips',
      { id: `boundary_booking_${i}`, customer_id: user.id }, quote.id, validate)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const unsignedRoute = { ...quote, consumed: false, request_params: {} };
    assert.throws(() => validate(unsignedRoute), /route binding/);

    await LedgerService.initChartOfAccounts();
    await assert.rejects(LedgerService.postTransaction({
      eventId: 'boundary_overspend', transactionType: 'TEST', referenceType: 'TEST', referenceId: 'test', description: 'test',
      entries: [
        { accountCode: '2010_CUSTOMER_WALLET_LIABILITY', ownerId: 'empty_wallet', direction: 'DEBIT', amountUgx: 1 },
        { accountCode: '1010_GATEWAY_CLEARING_DPO', direction: 'CREDIT', amountUgx: 1 },
      ],
    }), /Insufficient balance/);

    const setupToken = jwt.sign({ userId: user.id, email: user.email, scope: 'setup_password', tokenVersion: 1 }, ENV.JWT_SECRET, { expiresIn: '1h' });
    const setupResults = await Promise.allSettled([1, 2].map(i => AuthService.setupPassword(user.email, setupToken, `Strong-password-${i}`)));
    assert.equal(setupResults.filter(r => r.status === 'fulfilled').length, 1);

    const currentToken = AuthService.generateTokens(localStore.users.get(user.id)).accessToken;
    const socket = connect(base, { auth: { token: currentToken }, reconnection: false, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    const disconnected = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Revoked socket remained connected')), 4000);
      socket.once('disconnect', () => { clearTimeout(timer); resolve(); });
    });
    localStore.users.get(user.id).token_version += 1;
    await disconnected;
    socket.close();

    const sseToken = AuthService.generateTokens(localStore.users.get(user.id)).accessToken;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(base + '/api/v1/realtime/stream', { headers: { Authorization: `Bearer ${sseToken}` }, signal: controller.signal });
    assert.equal(response.status, 200);
    const reader = response.body!.getReader(); await reader.read();
    localStore.users.get(user.id).approval_status = 'SUSPENDED';
    while (!(await reader.read()).done) { /* wait for server-side revocation */ }
    clearTimeout(timeout);
    console.log('PASS: HTTP document/quote isolation, atomic quote and token use, ledger overspend, WebSocket and SSE revocation.');
  } finally {
    await new Promise<void>(resolve => sockets.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
}
run().catch(error => { console.error(error); process.exit(1); });
