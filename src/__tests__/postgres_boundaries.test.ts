import assert from 'assert/strict';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { db, localStore } from '../config/database';
import { LedgerService } from '../services/financial/ledger.service';
import { commitBooking } from '../services/pricing/booking_commit';
import { PricingEngineService } from '../services/pricing/pricing_engine.service';
import { validateAuthSession } from '../gateway/auth_middleware';
import { AuthService } from '../services/auth/auth.service';

const url = process.env.SAFARIS_PG_TEST_URL || '';
if (process.env.NODE_ENV !== 'test' || !/^postgres(?:ql)?:\/\/[^/]+\/(safaris_security_test)(?:\?.*)?$/.test(url)
    || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !process.env.SAFARIS_TEST_DATA_DIR) {
  throw new Error('Explicit isolated localhost safaris_security_test database and test data directory required.');
}
const mode = process.argv[2];
const wallet = 'pg_boundary_wallet';
const pool = new Pool({ connectionString: url, max: 3 });

async function attach() {
  await db.waitForReady();
  (db as any).pool = pool;
  db.isPostgresConnected = true;
  await LedgerService.initChartOfAccounts();
}
async function post(kind: string, index: string) {
  const debit = kind === 'debit';
  await LedgerService.postTransaction({
    eventId: kind === 'duplicate' ? 'pg_replay_event' : `pg_${kind}_${index}`,
    transactionType: 'TEST', referenceType: 'TEST', referenceId: wallet, environment: 'sandbox', description: 'PostgreSQL concurrency regression',
    entries: [
      { accountCode: '1010_GATEWAY_CLEARING_DPO', direction: debit ? 'CREDIT' : 'DEBIT', amountUgx: debit ? 7000 : 1000 },
      { accountCode: '2010_CUSTOMER_WALLET_LIABILITY', ownerId: wallet, direction: debit ? 'DEBIT' : 'CREDIT', amountUgx: debit ? 7000 : 1000 },
    ],
  });
}
async function worker() {
  await attach();
  if (mode === 'credit') for (let i = 0; i < 5; i++) await post('credit', `${process.argv[3]}_${i}`);
  else if (mode === 'debit' || mode === 'duplicate') await post(mode, process.argv[3]);
  else if (mode === 'quote') {
    const id = 'pg_quote';
    await commitBooking('trips', trip(`quote_${process.argv[3]}`), id, storedQuote => PricingEngineService.validateQuotation({
      quotationId: id, expectedServiceType: 'RIDE', customerId: wallet,
      pickupLat: 0, pickupLng: 0, destLat: 0, destLng: 1, storedQuote,
    }));
  } else if (mode === 'setup') {
    await db.setPasswordWithTokenAtomic({ tokenHash: 'one-use-token', userId: wallet, email: 'pg@example.invalid',
      passwordHash: `password-${process.argv[3]}`, expectedVersion: 1, expiresAt: new Date(Date.now() + 60000) });
  }
}
function trip(id: string): any {
  return { id, customer_id: wallet, pickup_title: 'test', pickup_address: 'test', pickup_lat: 0, pickup_lng: 0,
    dest_title: 'test', dest_address: 'test', dest_lat: 0, dest_lng: 1, vehicle_tier: 'go', status: 'SEARCHING',
    distance_km: 150, estimated_duration_mins: 180, fare_ugx: 1000, quotation_id: 'pg_quote' };
}
function child(action: string, index: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.resolve('node_modules/ts-node/dist/bin.js'), '--transpile-only', __filename, action, String(index)], {
      env: { ...process.env, DISABLE_DATABASE: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = ''; proc.stdout.on('data', data => output += data); proc.stderr.on('data', data => output += data);
    proc.on('error', reject); proc.on('exit', code => {
      if (code && code !== 2) console.error(output);
      resolve(code ?? 1);
    });
  });
}
async function run() {
  if (mode) { await worker(); return; }
  // Fresh CI-only database: test the production schema and every migration.
  await pool.query(fs.readFileSync('src/database/schema.sql', 'utf8'));
  for (const file of fs.readdirSync('src/database/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join('src/database/migrations', file), 'utf8'));
  }
  await attach();
  await pool.query(`INSERT INTO users(id, full_name, phone, email, password_hash, role, approval_status, is_verified, token_version)
    VALUES ($1, 'Test', '+256000000001', 'pg@example.invalid', 'hash', 'customer', 'APPROVED', TRUE, 1)`, [wallet]);
  assert((await Promise.all(Array.from({ length: 6 }, (_, i) => child('credit', i)))).every(c => c === 0));
  const balance = async () => Number((await pool.query("SELECT net_balance_ugx FROM account_balance_projections WHERE account_code = '2010_CUSTOMER_WALLET_LIABILITY' AND owner_id = $1", [wallet])).rows[0].net_balance_ugx);
  assert.equal(await balance(), 30000, 'Concurrent first-use credits must not overwrite balances');
  const spent = await Promise.all(Array.from({ length: 6 }, (_, i) => child('debit', i)));
  assert.equal(spent.filter(c => c === 0).length, 4);
  assert.equal(await balance(), 2000);
  assert((await Promise.all([0, 1].map(i => child('duplicate', i)))).every(c => c === 0));
  assert.equal(await balance(), 3000, 'Replayed event must credit only once across processes');
  await pool.query(`INSERT INTO price_quotations(id, service_type, customer_id, total_price_ugx, currency, pricing_version, breakdown, request_params, expires_at)
    VALUES ('pg_quote', 'RIDE', $1, 1000, 'UGX', 1, '[]', '{"pickupLat":0,"pickupLng":0,"destLat":0,"destLng":1}', CURRENT_TIMESTAMP + interval '1 hour')`, [wallet]);
  const quoted = await Promise.all([0, 1].map(i => child('quote', i)));
  assert.equal(quoted.filter(c => c === 0).length, 1, 'Only one independent process may book a quote');
  await pool.query("UPDATE price_quotations SET consumed = FALSE WHERE id = 'pg_quote'");
  await assert.rejects(commitBooking('trips', { ...trip('invalid_booking'), pickup_title: null }, 'pg_quote', () => {}));
  assert.equal((await pool.query("SELECT consumed FROM price_quotations WHERE id = 'pg_quote'")).rows[0].consumed, false, 'Failed booking must roll back quote consumption');
  const setups = await Promise.all([0, 1].map(i => child('setup', i)));
  assert.equal(setups.filter(c => c === 0).length, 1, 'Setup token must have one winner across processes');
  const user = (await pool.query('SELECT * FROM users WHERE id = $1', [wallet])).rows[0];
  localStore.users.set(wallet, user);
  const token = AuthService.generateTokens(user).accessToken;
  await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [wallet]);
  assert.equal((await validateAuthSession(token)).valid, false, 'Stale process cache must not defeat revocation');
  console.log('PASS: real PostgreSQL multi-process credits, overspend, idempotency, quote rollback, token replay and revocation.');
}
run().then(async () => { await pool.end(); }).catch(async error => {
  console.error(error.message); await pool.end(); process.exit(mode ? 2 : 1);
});
