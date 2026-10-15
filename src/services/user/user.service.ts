import { localStore, db } from '../../config/database';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../notification/notification.service';

export class UserService {
  public static getProfile(userId: string) {
    const user = localStore.users.get(userId);
    if (!user) {
      throw new Error('User profile not found.');
    }
    return AuthService.sanitizeUser(user);
  }

  public static async updateProfile(userId: string, data: Partial<{ fullName: string; phone: string; email: string }>) {
    const user = localStore.users.get(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    if (data.fullName) user.full_name = data.fullName;
    if (data.phone) user.phone = data.phone;
    if (data.email) user.email = data.email;

    await db.persistUser(user);

    return AuthService.sanitizeUser(user);
  }

  public static async topUpWallet(userId: string, amountUGX: number) {
    const user = localStore.users.get(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    user.wallet_balance_ugx += amountUGX;

    await db.persistUser(user);

    // Direct database notification for wallet credit
    NotificationService.createNotification({
      userId,
      title: 'Wallet Top-up Successful',
      message: `UGX ${amountUGX.toLocaleString()} has been credited to your SAFARIS wallet via Mobile Money.`,
      type: 'PAYMENT',
      metadata: {
        amountUgx: amountUGX,
        newBalanceUgx: user.wallet_balance_ugx,
        source: 'MOBILE_MONEY',
      },
    }).catch((err) => console.error('[TopUpNotification Error]', err));

    return {
      walletBalanceUGX: user.wallet_balance_ugx,
      message: `Successfully topped up UGX ${amountUGX.toLocaleString()} via Mobile Money.`,
    };
  }

  public static async switchRole(userId: string, newRole: string) {
    const user = localStore.users.get(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    user.role = newRole;
    await db.persistUser(user);

    return AuthService.sanitizeUser(user);
  }
}
