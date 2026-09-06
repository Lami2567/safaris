import { localStore } from '../../config/database';
import { AuthService } from '../auth/auth.service';

export class UserService {
  public static getProfile(userId: string) {
    const user = localStore.users.get(userId);
    if (!user) {
      throw new Error('User profile not found.');
    }
    return AuthService.sanitizeUser(user);
  }

  public static updateProfile(userId: string, data: Partial<{ fullName: string; phone: string; email: string }>) {
    const user = localStore.users.get(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    if (data.fullName) user.full_name = data.fullName;
    if (data.phone) user.phone = data.phone;
    if (data.email) user.email = data.email;

    return AuthService.sanitizeUser(user);
  }

  public static topUpWallet(userId: string, amountUGX: number) {
    const user = localStore.users.get(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    user.wallet_balance_ugx += amountUGX;
    return {
      walletBalanceUGX: user.wallet_balance_ugx,
      message: `Successfully topped up UGX ${amountUGX.toLocaleString()} via Mobile Money.`,
    };
  }

  public static switchRole(userId: string, newRole: string) {
    const user = localStore.users.get(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    user.role = newRole;
    return AuthService.sanitizeUser(user);
  }
}
