import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { ENV } from '../../config/env';
import { localStore } from '../../config/database';

export class AuthService {
  public static async register(data: {
    fullName: string;
    phone: string;
    email: string;
    password: string;
    role?: string;
  }) {
    // Check if phone or email already exists
    for (const user of localStore.users.values()) {
      if (user.phone === data.phone) {
        throw new Error('Phone number is already registered.');
      }
      if (user.email.toLowerCase() === data.email.toLowerCase()) {
        throw new Error('Email is already registered.');
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const userId = `usr_${uuidv4().substring(0, 8)}`;
    const role = data.role || 'customer';

    const newUser = {
      id: userId,
      full_name: data.fullName,
      phone: data.phone,
      email: data.email,
      password_hash: passwordHash,
      role,
      avatar_url: '',
      rating: 5.0,
      total_trips: 0,
      wallet_balance_ugx: 50000.0, // Welcome bonus UGX 50,000
      is_verified: true,
      created_at: new Date().toISOString(),
    };

    localStore.users.set(userId, newUser);

    // If registered as driver or tour guide, create empty profile
    if (role === 'driver') {
      localStore.drivers.set(userId, {
        id: userId,
        vehicle_id: null,
        is_online: false,
        is_available: true,
        current_lat: 0.3136,
        current_lng: 32.5811,
        heading: 0,
        license_number: '',
        license_expiry: '',
        acceptance_rate: 100.0,
        today_earnings_ugx: 0,
      });
    } else if (role === 'tour_guide') {
      localStore.tour_guides.set(userId, {
        id: userId,
        title: 'Uganda Safari Guide',
        bio: 'Professional guide certified for Uganda tourism adventures.',
        languages: ['English', 'Luganda'],
        specialties: ['National Parks'],
        daily_rate_ugx: 150000.0,
        is_uwa_certified: true,
        is_available: true,
        expeditions_count: 0,
      });
    }

    const tokens = this.generateTokens(newUser);
    return { user: this.sanitizeUser(newUser), ...tokens };
  }

  public static async login(identifier: string, password: string) {
    let foundUser: any = null;

    // Support login by phone or email
    for (const user of localStore.users.values()) {
      if (
        user.phone === identifier ||
        user.phone === `+256 ${identifier}` ||
        user.email.toLowerCase() === identifier.toLowerCase()
      ) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser) {
      throw new Error('Account with this phone or email not found.');
    }

    const isMatch = await bcrypt.compare(password, foundUser.password_hash);
    if (!isMatch) {
      throw new Error('Invalid password.');
    }

    const tokens = this.generateTokens(foundUser);
    return { user: this.sanitizeUser(foundUser), ...tokens };
  }

  public static async verifyOtp(phone: string, otpCode: string) {
    // In development / demo mode, any 4-digit code (e.g. 1234) is accepted
    if (!otpCode || otpCode.length < 4) {
      throw new Error('Invalid verification code.');
    }

    let foundUser: any = null;
    for (const user of localStore.users.values()) {
      if (user.phone === phone || user.phone === `+256 ${phone}`) {
        foundUser = user;
        break;
      }
    }

    if (foundUser) {
      foundUser.is_verified = true;
      const tokens = this.generateTokens(foundUser);
      return { user: this.sanitizeUser(foundUser), ...tokens };
    }

    return { verified: true, message: 'OTP verified successfully.' };
  }

  public static generateTokens(user: any) {
    const payload = {
      userId: user.id,
      role: user.role,
      phone: user.phone,
      email: user.email,
    };

    const accessToken = jwt.sign(payload, ENV.JWT_SECRET, {
      expiresIn: ENV.JWT_EXPIRES_IN as any,
    });

    const refreshToken = jwt.sign(payload, ENV.REFRESH_TOKEN_SECRET, {
      expiresIn: ENV.REFRESH_TOKEN_EXPIRES_IN as any,
    });

    return { accessToken, refreshToken };
  }

  public static sanitizeUser(user: any) {
    const { password_hash, ...sanitized } = user;
    return sanitized;
  }
}
