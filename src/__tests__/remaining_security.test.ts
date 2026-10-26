import assert from 'assert/strict';
import bcrypt from 'bcryptjs';
import express from 'express';
import http from 'http';
import { db, localStore } from '../config/database';
import { apiRouter } from '../gateway/routes';
import { AuthService } from '../services/auth/auth.service';
import { CareerService } from '../services/career/career.service';
import { EmailService } from '../services/email/email.service';
import { validateAuthSession } from '../gateway/auth_middleware';
import { configureTrustedProxy } from '../gateway/trusted_proxy';
import { rateLimiter, authenticationRateLimiter, consumeRateLimit } from '../gateway/rate_limiter';

async function serve(app: express.Express, run: (base: string) => Promise<void>) {
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try { await run(`http://127.0.0.1:${(server.address() as any).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
}
const fixture = (id: string, role = 'customer') => ({ id, full_name: 'Synthetic security test', phone: `+256${id === 'remaining_owner' ? '700000003' : '700000004'}`,
  email: `${id}@example.invalid`, password_hash: '', role, approval_status: 'APPROVED', is_verified: true, token_version: 7 });

/** Run against the isolated native PostgreSQL CI database, or an embedded PG adapter locally. */
export async function runDatabaseSecurityRegressions(pool: any) {
  const user = fixture('remaining_owner'); user.password_hash = await bcrypt.hash('Correct-isolated-password', 4);
  const admin = fixture('remaining_admin', 'admin'); admin.password_hash = user.password_hash;
  for (const u of [user, admin]) await pool.query(`INSERT INTO users(id,full_name,phone,email,password_hash,role,approval_status,is_verified,token_version)
    VALUES ($1,$2,$3,$4,$5,$6,'APPROVED',TRUE,7)`, [u.id,u.full_name,u.phone,u.email,u.password_hash,u.role]);
  const snapshot = async () => (await pool.query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
  const revoked = AuthService.generateTokens({ ...user, token_version: 1 }).accessToken;
  for (const password of ['wrong-password', 'Correct-isolated-password']) {
    await pool.query("UPDATE users SET approval_status = 'SUSPENDED' WHERE id = $1", [user.id]);
    localStore.users.clear(); const before = await snapshot();
    await assert.rejects(AuthService.login(user.email, password), /not approved/);
    assert.deepEqual(await snapshot(), before, 'Login must not mutate a suspended database record');
    AuthService.setLoginOtp(user.email, '123456');
    await assert.rejects(AuthService.loginWithOtp(user.email, '123456'));
    await assert.rejects(AuthService.verifyEmailOtp(user.email, '123456'));
    assert.deepEqual(await snapshot(), before, 'OTP methods must not reapprove a suspended record');
  }
  await pool.query("UPDATE users SET approval_status = 'APPROVED' WHERE id = $1", [user.id]);
  localStore.users.clear(); await assert.rejects(AuthService.login(user.email, 'wrong-password'), /Invalid password/);
  const loggedIn = await AuthService.login(user.email, 'Correct-isolated-password');
  assert('accessToken' in loggedIn);
  assert.equal((await validateAuthSession(loggedIn.accessToken)).valid, true);
  assert.equal((await snapshot()).token_version, 7);
  AuthService.setLoginOtp(user.email, '123456');
  const otpLogin = await AuthService.loginWithOtp(user.email, '123456');
  assert.equal(otpLogin.user.token_version, 7);
  assert.equal((await validateAuthSession(revoked)).valid, false);
  const stale = await snapshot();
  await Promise.all([db.updateUserSecurity(user.id, { password_hash: 'changed-password-hash', approval_status: 'SUSPENDED' }),
    db.updateUserProfile(user.id, { full_name: 'Updated profile' })]);
  await db.persistUser({ ...stale, full_name: 'Old background task' });
  const secured = await snapshot();
  assert.equal(secured.token_version, 8); assert.equal(secured.approval_status, 'SUSPENDED');
  assert.equal(secured.password_hash, 'changed-password-hash');
  await db.updateUserSecurity(user.id, { approval_status: 'APPROVED' });
  const ownerToken = AuthService.generateTokens(await snapshot()).accessToken;
  const adminToken = AuthService.generateTokens(admin).accessToken;
  await pool.query(`INSERT INTO notifications(id,user_id,title,message,type,is_read) VALUES ('remaining_victim_notification',$1,'Test','Test','SYSTEM',FALSE)`, [admin.id]);
  await pool.query(`INSERT INTO notifications(id,user_id,title,message,type,is_read) VALUES ('remaining_owner_notification',$1,'Test','Test','SYSTEM',FALSE)`, [user.id]);
  localStore.notifications.clear();
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
  await serve(app, async base => {
    assert.equal((await fetch(base + '/api/v1/notifications/remaining_owner_notification/read', { method: 'PUT', headers: headers(ownerToken) })).status, 200);
    assert.equal((await fetch(base + '/api/v1/notifications/remaining_owner_notification', { method: 'DELETE', headers: headers(adminToken) })).status, 200);
    for (const [path, method] of [['/notifications/remaining_victim_notification/read', 'PUT'], ['/notifications/remaining_victim_notification', 'DELETE']]) {
      assert.equal((await fetch(base + '/api/v1' + path, { method, headers: headers(ownerToken) })).status, 404);
    }
    assert.equal((await pool.query("SELECT is_read FROM notifications WHERE id = 'remaining_victim_notification'")).rows[0].is_read, false);
    assert.equal((await fetch(base + '/api/v1/notifications/remaining_victim_notification/read', { method: 'PUT', headers: headers(adminToken) })).status, 200);
    assert.equal((await fetch(base + '/api/v1/notifications/remaining_victim_notification', { method: 'DELETE', headers: headers(adminToken) })).status, 200);
    assert.equal((await fetch(base + '/api/v1/notifications/remaining_victim_notification', { method: 'DELETE', headers: headers(adminToken) })).status, 404);
  });
  await pool.query(`INSERT INTO career_applications(id,user_id,applicant_type,full_name,email,phone,status)
    VALUES ('remaining_application',$1,'driver','Private applicant',$2,'+256700000005','PENDING_APPROVAL')`, [user.id, user.email]);
  let link = ''; const originalEmail = EmailService.sendApplicationStatusLink;
  EmailService.sendApplicationStatusLink = async (_email, url) => { link = url; return true; };
  try {
    await CareerService.requestStatusLink(user.email);
    const token = link.split('application-status=')[1];
    assert.equal((await CareerService.getApplicationStatus(token)).application_id, 'remaining_application');
    assert.equal((await validateAuthSession(token)).valid, false);
    const stored = (await pool.query("SELECT * FROM career_status_tokens WHERE application_id = 'remaining_application'")).rows[0];
    assert.notEqual(stored.token_hash, token); assert.equal(stored.token_hash.length, 64);
    await CareerService.requestStatusLink(user.email);
    await assert.rejects(CareerService.getApplicationStatus(token));
    const replacement = link.split('application-status=')[1];
    await pool.query("UPDATE career_status_tokens SET expires_at = CURRENT_TIMESTAMP - interval '1 second' WHERE application_id = 'remaining_application'");
    await assert.rejects(CareerService.getApplicationStatus(replacement));
    await assert.rejects(CareerService.getApplicationStatus(user.email));
    await assert.rejects(CareerService.getApplicationStatus('remaining_application'));
    assert.equal(await consumeRateLimit('database-expiry', 1, 60000), 0);
    assert((await consumeRateLimit('database-expiry', 1, 60000)) > 0);
    await pool.query('UPDATE security_rate_limits SET expires_at = CURRENT_TIMESTAMP - interval \'1 second\'');
    assert.equal(await consumeRateLimit('database-expiry', 1, 60000), 0);
  } finally { EmailService.sendApplicationStatusLink = originalEmail; }
  console.log('PASS: database login immutability, monotonic revocation, concurrent profile security, notification HTTP ownership, hashed/rotated/expired status capabilities and counter expiry.');
}

async function run() {
  await db.waitForReady();
  const user = fixture('remaining_local'); user.password_hash = await bcrypt.hash('Correct-isolated-password', 4);
  localStore.users.set(user.id, { ...user, approval_status: 'SUSPENDED' });
  await assert.rejects(AuthService.login(user.email, 'wrong-password'), /not approved/);
  assert.equal(localStore.users.get(user.id).token_version, 7);
  localStore.users.set(user.id, user);
  const app = express(); app.set('trust proxy', 'loopback'); app.use(rateLimiter); app.use(express.json());
  app.use(authenticationRateLimiter); app.use('/api/v1', apiRouter);
  app.get('/client', (req, res) => res.json({ ip: req.ip }));
  await serve(app, async base => {
    const blockedLookup = await fetch(base + '/api/v1/careers/status?email=' + user.email);
    assert.equal(blockedLookup.status, 403);
    const requestLink = async (email: string) => (await fetch(base + '/api/v1/careers/status-link', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.10' }, body: JSON.stringify({ email }) })).json();
    assert.deepEqual(await requestLink(user.email), await requestLink('unknown@example.invalid'));
    for (let i = 0; i < 11; i++) {
      const response = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${i + 1}` }, body: JSON.stringify({ identifier: user.email.toUpperCase(), password: 'wrong-password' }) });
      assert.equal(response.status, i < 10 ? 401 : 429);
      if (i === 10) assert(Number(response.headers.get('Retry-After')) > 0);
    }
    for (let i = 0; i < 120; i++) assert.equal((await fetch(base + '/client', { headers: { 'X-Forwarded-For': '203.0.113.20' } })).status, 200);
    assert.equal((await fetch(base + '/client', { headers: { 'X-Forwarded-For': '203.0.113.20' } })).status, 429);
    assert.equal((await fetch(base + '/client', { headers: { 'X-Forwarded-For': '203.0.113.21' } })).status, 200);
  });
  const direct = express(); let resolved = ['203.0.113.1'];
  const trust = configureTrustedProxy(direct, 'nginx', async () => resolved);
  await trust.refresh();
  direct.get('/client', (req, res) => res.json({ ip: req.ip }));
  try { await serve(direct, async base => {
    const request = async () => (await (await fetch(base + '/client', { headers: { 'X-Forwarded-For': '203.0.113.9' } })).json()) as any;
    assert.equal((await request()).ip, '127.0.0.1');
    resolved = ['127.0.0.1']; await trust.refresh();
    assert.equal((await request()).ip, '203.0.113.9');
    resolved = ['203.0.113.1']; await trust.refresh();
    assert.equal((await request()).ip, '127.0.0.1', 'Recreated proxy must not leave its old address trusted');
  }); } finally { trust.stop(); }
  // A storage failure cannot be reported as successful notification deletion.
  const { NotificationController } = await import('../services/notification/notification.controller');
  const originalQuery = db.query; const connected = db.isPostgresConnected;
  db.isPostgresConnected = true; db.query = async () => { throw new Error('Synthetic unavailable storage'); };
  let status = 0; const res: any = { status(code: number) { status = code; return this; }, json() { return this; } };
  try { await NotificationController.deleteNotification({ params: { id: 'none' }, user: { userId: user.id, role: 'customer' } } as any, res); assert.equal(status, 503); }
  finally { db.query = originalQuery; db.isPostgresConnected = connected; }
  console.log('PASS: suspended login, private lookup, generic status request, account/IP limits, spoofed proxies and notification storage failure.');
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
