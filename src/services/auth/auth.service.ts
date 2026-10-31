import { resolveDataFilePaths } from '../../config/paths';
import { disconnectUserSockets } from '../../realtime/socket_server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { ENV } from '../../config/env';
import { localStore, db } from '../../config/database';
import { EmailService } from '../email/email.service';
import { FinancialService } from '../financial/financial.service';
import { getUgandaPhoneVariants, normalizeUgandaPhone } from '../../shared/phone';

interface OtpRecord {
  code: string;
  expiresAt: number;
  fullName: string;
  lastSentAt: number;
}

export class AuthService {
  // Persistent OTP store (backed by disk + memory)
  private static emailOtpStore = new Map<string, OtpRecord>();
  private static otpsInitialized = false;
  private static usedSetupTokens = new Set<string>();
  private static setupAttempts = new Map<string, { count: number; lockedUntil: number }>();

  private static getOtpFilePath(): string {
    const candidates = resolveDataFilePaths('persistent_otps.json');
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return candidates[0];
  }

  private static loadOtps(): void {
    if (this.otpsInitialized) return;
    try {
      const p = this.getOtpFilePath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            const rec = v as OtpRecord;
            if (rec && rec.expiresAt > Date.now()) {
              this.emailOtpStore.set(k.toLowerCase(), rec);
            }
          }
        }
      }
    } catch (_) {}
    this.otpsInitialized = true;
  }

  private static saveOtps(): void {
    try {
      const p = this.getOtpFilePath();
      const obj: Record<string, OtpRecord> = {};
      for (const [k, v] of this.emailOtpStore.entries()) {
        if (v && v.expiresAt > Date.now()) {
          obj[k] = v;
        }
      }
      const dir = path.dirname(p);
      if (fs.existsSync(dir)) {
        fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8');
      }
    } catch (_) {}
  }

  public static async register(data: {
    fullName: string;
    phone: string;
    email: string;
    password: string;
    role?: string;
  }) {
    this.loadOtps();
    const role = data.role || 'customer';

    // Drivers and Tour Guides are not allowed to register from the customer mobile app
    if (role === 'driver' || role === 'tour_guide') {
      throw new Error(
        'Drivers and Tour Guides must apply and create accounts via careers.mumwesafarisuganda.com'
      );
    }

    const cleanEmail = (data.email || '').toLowerCase().trim();
    const rawPhone = (data.phone || '').trim();
    const cleanPhone = normalizeUgandaPhone(rawPhone);
    const phoneVariants = getUgandaPhoneVariants(rawPhone);

    // 1. Check if email or phone already exists in localStore cache
    for (const user of localStore.users.values()) {
      if (user.email && typeof user.email === 'string' && user.email.toLowerCase() === cleanEmail) {
        throw new Error('Email is already registered.');
      }
      if (user.phone && typeof user.phone === 'string') {
        const userVariants = getUgandaPhoneVariants(user.phone);
        if (phoneVariants.some(v => userVariants.includes(v))) {
          throw new Error('Phone number is already registered.');
        }
      }
    }

    // 2. Check if email or phone already exists in PostgreSQL
    if (db.isPostgresConnected) {
      try {
        const existingRes = await db.query(
          'SELECT id, email, phone FROM users WHERE LOWER(email) = LOWER($1) OR phone = ANY($2::text[])',
          [cleanEmail, phoneVariants]
        );
        if (existingRes && existingRes.rows && existingRes.rows.length > 0) {
          const row = existingRes.rows[0];
          if (row.email && row.email.toLowerCase() === cleanEmail) {
            throw new Error('Email is already registered.');
          }
          throw new Error('Phone number is already registered.');
        }
      } catch (err: any) {
        if (err.message && (err.message.includes('already registered') || err.message.includes('Email is') || err.message.includes('Phone number is'))) {
          throw err;
        }
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const userId = `usr_${uuidv4().substring(0, 8)}`;

    const newUser = {
      id: userId,
      full_name: data.fullName.trim(),
      phone: cleanPhone,
      email: cleanEmail,
      password_hash: passwordHash,
      role: 'customer',
      avatar_url: '',
      rating: 5.0,
      total_trips: 0,
      wallet_balance_ugx: 0.0,
      is_verified: false, // Unverified until email OTP confirmation
      created_at: new Date().toISOString(),
    };

    // 3. Persist permanently to PostgreSQL and disk storage
    await db.persistUser(newUser);
    console.log(`✅ [AuthService] New customer registered and permanently saved to database: ${newUser.full_name} (${cleanEmail})`);

    // 4. Generate 6-digit email OTP using cryptographically secure randomInt
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    this.emailOtpStore.set(cleanEmail, {
      code: otpCode,
      expiresAt,
      fullName: newUser.full_name,
      lastSentAt: Date.now(),
    });
    this.saveOtps();

    // 5. Send email via EmailService
    try {
      await EmailService.sendOtpEmail(cleanEmail, newUser.full_name, otpCode);
    } catch (e) {
      console.warn('[AuthService] Could not send OTP email (non-fatal):', e);
    }

    return {
      requiresVerification: true,
      email: cleanEmail,
      phone: cleanPhone,
      message: 'A 6-digit verification code has been sent to your email address.',
    };
  }

  public static async verifyEmailOtp(email: string, otpCode: string) {
    this.loadOtps();
    if (!email || !otpCode) {
      throw new Error('Email and verification code are required.');
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otpCode.trim();

    const record = this.emailOtpStore.get(cleanEmail);

    if (!record) {
      throw new Error('No active verification code found for this email. Please request a new code.');
    }

    if (Date.now() > record.expiresAt) {
      this.emailOtpStore.delete(cleanEmail);
      this.saveOtps();
      throw new Error('Verification code has expired. Please request a new one.');
    }

    if (record.code !== cleanOtp) {
      throw new Error('Invalid verification code. Please check your email and try again.');
    }

    const foundUser = await db.findUserByLogin(cleanEmail);

    if (!foundUser) {
      throw new Error('User account not found.');
    }

    if (foundUser.approval_status && foundUser.approval_status !== 'APPROVED') throw new Error('Account is not approved.');
    const verifiedUser = await db.updateUserSecurity(foundUser.id, { is_verified: true }, false);

    this.emailOtpStore.delete(cleanEmail);
    this.saveOtps();

    console.log(`✅ [AuthService] Account verified and activated permanently in database: ${foundUser.full_name} (${cleanEmail})`);

    const tokens = this.generateTokens(verifiedUser);
    return {
      user: this.sanitizeUser(verifiedUser),
      ...tokens,
      message: 'Email successfully verified. Welcome to SAFARIS Uganda!',
    };
  }

  public static async resendEmailOtp(email: string) {
    this.loadOtps();
    if (!email) {
      throw new Error('Email is required.');
    }

    const cleanEmail = email.toLowerCase().trim();

    const foundUser = await db.findUserByLogin(cleanEmail);

    if (!foundUser) {
      throw new Error('Account with this email not found.');
    }

    if (foundUser.is_verified) {
      return {
        alreadyVerified: true,
        message: 'This account is already verified. Please proceed to login.',
      };
    }

    // Rate-limit resends to once every 30 seconds
    const existing = this.emailOtpStore.get(cleanEmail);
    if (existing && Date.now() - existing.lastSentAt < 30 * 1000) {
      const waitSec = Math.ceil((30 * 1000 - (Date.now() - existing.lastSentAt)) / 1000);
      throw new Error(`Please wait ${waitSec} seconds before requesting a new code.`);
    }

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000;

    this.emailOtpStore.set(cleanEmail, {
      code: otpCode,
      expiresAt,
      fullName: foundUser.full_name,
      lastSentAt: Date.now(),
    });
    this.saveOtps();

    try {
      await EmailService.sendOtpEmail(cleanEmail, foundUser.full_name, otpCode);
    } catch (_) {}

    return {
      success: true,
      email: cleanEmail,
      message: 'A fresh verification code has been dispatched to your email.',
    };
  }

  public static async login(identifier: string, password: string) {
    this.loadOtps();
    let foundUser: any = null;
    const cleanId = identifier.trim();
    const isEmail = cleanId.includes('@');
    const phoneVariants = !isEmail ? getUgandaPhoneVariants(cleanId) : [];

    foundUser = await db.findUserByLogin(cleanId);

    if (!foundUser) {
      throw new Error('Account with this phone or email not found.');
    }

    if (foundUser.approval_status && foundUser.approval_status !== 'APPROVED') throw new Error('Account is not approved.');
    const isMatch = await bcrypt.compare(password, foundUser.password_hash);
    if (!isMatch) {
      throw new Error('Invalid password.');
    }

    // Check if email is verified
    if (!foundUser.is_verified) {
      const otpCode = crypto.randomInt(100000, 1000000).toString();
      const expiresAt = Date.now() + 15 * 60 * 1000;
      const targetEmail = (foundUser.email || '').toLowerCase().trim();

      if (targetEmail) {
        this.emailOtpStore.set(targetEmail, {
          code: otpCode,
          expiresAt,
          fullName: foundUser.full_name || 'Customer',
          lastSentAt: Date.now(),
        });
        this.saveOtps();

        try {
          await EmailService.sendOtpEmail(targetEmail, foundUser.full_name || 'Customer', otpCode);
        } catch (_) {}
      }

      return {
        requiresVerification: true,
        email: targetEmail || foundUser.email,
        phone: foundUser.phone,
        message: 'Account not verified. A verification code has been sent to your email.',
      };
    }

    const tokens = this.generateTokens(foundUser);
    return { user: this.sanitizeUser(foundUser), ...tokens };
  }

  public static generateTokens(user: any) {
    const payload = {
      userId: user.id,
      role: user.role,
      phone: user.phone,
      email: user.email,
      tokenVersion: Number(user.token_version ?? 1),
      scope: 'access',
    };

    const accessToken = jwt.sign(payload, ENV.JWT_SECRET, {
      expiresIn: ENV.JWT_EXPIRES_IN as any,
    });

    const refreshToken = jwt.sign(payload, ENV.REFRESH_TOKEN_SECRET, {
      expiresIn: ENV.REFRESH_TOKEN_EXPIRES_IN as any,
    });

    return { accessToken, refreshToken };
  }

  public static async refreshToken(token: string) {
    if (!token) throw new Error("Refresh token is required.");

    let payload: any;
    try {
      payload = jwt.verify(token, ENV.REFRESH_TOKEN_SECRET, { algorithms: ['HS256'] });
    } catch (err: any) {
      throw new Error("Refresh token expired or invalid. Please log in again.");
    }

    if (!payload.userId) {
      throw new Error("Malformed token claims.");
    }

    const liveUser = await db.getUserById(payload.userId);
    if (!liveUser) {
      throw new Error("User account no longer exists.");
    }

    if (liveUser.approval_status && liveUser.approval_status !== 'APPROVED') {
      throw new Error("Your account has been suspended.");
    }

    const tokenVer = Number(payload.tokenVersion ?? 1);
    const userVer = Number(liveUser.token_version ?? 1);
    if (tokenVer !== userVer) {
      throw new Error("Session has been revoked. Please log in again.");
    }

    const tokens = this.generateTokens(liveUser);
    return {
      user: this.sanitizeUser(liveUser),
      ...tokens,
    };
  }

  public static sanitizeUser(user: any) {
    const { password_hash, password, otp, token, setupToken, setup_token, ...sanitized } = user;
    try {
      const env = (ENV.DPO_ENVIRONMENT || 'sandbox') as any;
      sanitized.wallet_balance_ugx = FinancialService.calculateWalletBalance(user.id, env);
    } catch (_) {
      sanitized.wallet_balance_ugx = Number(user.wallet_balance_ugx || 0);
    }
    return sanitized;
  }

  /**
   * Set a login / activation OTP for an approved partner or driver
   */
  public static setLoginOtp(email: string, code: string, ttlMs = 48 * 3600 * 1000, fullName = '') {
    this.loadOtps();
    const cleanEmail = email.toLowerCase().trim();
    this.emailOtpStore.set(cleanEmail, {
      code,
      expiresAt: Date.now() + ttlMs,
      fullName,
      lastSentAt: Date.now(),
    });
    this.saveOtps();
  }

  /**
   * Log in an approved driver or tour guide using their email and OTP
   */
  public static async loginWithOtp(email: string, otpCode: string) {
    this.loadOtps();
    if (!email || !otpCode) {
      throw new Error('Email address and 6-digit OTP code are required.');
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otpCode.trim();

    const record = this.emailOtpStore.get(cleanEmail);

    if (!record) {
      throw new Error('No active login OTP found for this email. Please ensure your application has been approved.');
    }

    if (Date.now() > record.expiresAt) {
      this.emailOtpStore.delete(cleanEmail);
      this.saveOtps();
      throw new Error('The OTP code has expired. Please contact support or request a new activation link.');
    }

    if (record.code !== cleanOtp) {
      throw new Error('Invalid OTP code. Please check your approval email and try again.');
    }

    let user = await db.findUserByLogin(cleanEmail);

    if (!user) {
      throw new Error('No registered account found matching this email.');
    }

    if (user.approval_status !== 'APPROVED') {
      throw new Error(`Your application is currently ${user.approval_status || 'PENDING'}. Please wait for admin review.`);
    }

    // User is verified upon OTP confirmation
    user = await db.updateUserSecurity(user.id, { is_verified: true }, false);

    // Generate temporary setup token for password initialization
    const setupToken = jwt.sign(
      { userId: user.id, email: user.email, scope: 'setup_password', tokenVersion: Number(user.token_version || 1) },
      ENV.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Fetch attached driver or guide details
    const driver = localStore.drivers.get(user.id);
    const guide = localStore.tour_guides.get(user.id);
    const vehicle = driver?.vehicle_id ? localStore.vehicles.get(driver.vehicle_id) : null;

    return {
      success: true,
      requiresPasswordSetup: true,
      setupToken,
      user: {
        ...this.sanitizeUser(user),
        driver_details: driver || null,
        guide_details: guide || null,
        vehicle_details: vehicle || null,
      },
      message: 'OTP verified. Please set your new permanent password to access your dashboard.',
    };
  }

  /**
   * Complete password setup after OTP verification
   */
  public static async setupPassword(email: string, setupToken: string, newPassword: string) {
    if (!email || !setupToken || !newPassword) {
      throw new Error('Email, setup token, and new password are required.');
    }

    const cleanEmail = email.toLowerCase().trim();
    const attemptKey = cleanEmail;
    const attempt = this.setupAttempts.get(attemptKey);
    if (attempt && attempt.lockedUntil > Date.now()) {
      const waitMinutes = Math.ceil((attempt.lockedUntil - Date.now()) / (60 * 1000));
      throw new Error(`Too many failed attempts. Account password setup is temporarily locked for ${waitMinutes} more minutes.`);
    }

    const recordFailedAttempt = () => {
      const cur = this.setupAttempts.get(attemptKey) || { count: 0, lockedUntil: 0 };
      cur.count += 1;
      if (cur.count >= 5) {
        cur.lockedUntil = Date.now() + 15 * 60 * 1000;
      }
      this.setupAttempts.set(attemptKey, cur);
    };

    if (newPassword.length < 6) {
      recordFailedAttempt();
      throw new Error('Password must be at least 6 characters long.');
    }

    const tokenHash = crypto.createHash('sha256').update(setupToken).digest('hex');
    let decoded: any = null;
    try {
      decoded = jwt.verify(setupToken, ENV.JWT_SECRET);
    } catch {
      recordFailedAttempt();
      throw new Error('Session or setup token has expired. Please log in with your OTP again.');
    }

    if (decoded.scope !== 'setup_password' || !decoded.userId || !Number.isInteger(decoded.tokenVersion) || !Number.isFinite(decoded.exp) || decoded.email?.toLowerCase() !== cleanEmail) {
      recordFailedAttempt();
      throw new Error('Invalid setup token for this account.');
    }

    let user: any = null;
    for (const u of localStore.users.values()) {
      if (u.email && u.email.toLowerCase() === cleanEmail) {
        user = u;
        break;
      }
    }

    if (!user && db.isPostgresConnected) {
      const res = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [cleanEmail]);
      if (res && res.rows && res.rows.length > 0) {
        user = res.rows[0];
      }
    }

    if (!user) {
      recordFailedAttempt();
      throw new Error('User account not found.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user = await db.setPasswordWithTokenAtomic({
      tokenHash, userId: decoded.userId, email: cleanEmail, passwordHash, expectedVersion: decoded.tokenVersion,
      expiresAt: new Date(decoded.exp * 1000),
    });
    this.emailOtpStore.delete(cleanEmail);
    this.saveOtps();
    this.setupAttempts.delete(attemptKey);

    // Disconnect active user sockets to enforce clean re-authentication
    disconnectUserSockets(user.id, 'PASSWORD_SETUP');

    // Generate production tokens
    const tokens = this.generateTokens(user);

    // Fetch driver / guide details
    const driver = localStore.drivers.get(user.id);
    const guide = localStore.tour_guides.get(user.id);
    const vehicle = driver?.vehicle_id ? localStore.vehicles.get(driver.vehicle_id) : null;

    return {
      success: true,
      message: 'Password successfully configured. Welcome to your Mumwe Safaris Dashboard!',
      user: {
        ...this.sanitizeUser(user),
        driver_details: driver || null,
        guide_details: guide || null,
        vehicle_details: vehicle || null,
      },
      ...tokens,
    };
  }
}

