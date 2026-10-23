import { localStore, db } from '../../config/database';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../notification/notification.service';
import { FinancialService } from '../financial/financial.service';
import { DpoPayGateway } from '../payment/dpo_gateway';
import { PaymentService } from '../payment/payment.service';

export class UserService {
  public static async getProfile(userId: string) {
    let user = localStore.users.get(userId);
    if (!user && db.isPostgresConnected) {
      try {
        const res = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (res?.rows?.length > 0) {
          user = res.rows[0];
          localStore.users.set(userId, user);
        }
      } catch (_) {}
    }

    if (!user) {
      throw new Error('User profile not found.');
    }

    // Pull authoritative wallet balance strictly from verified database ledger
    const env = DpoPayGateway.environment;
    const verifiedBalance = FinancialService.calculateWalletBalance(userId, env);
    user.wallet_balance_ugx = verifiedBalance;

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

  public static async topUpWallet(userId: string, amountUGX: number, paymentMethod: any = 'MTN_MOMO', phone?: string) {
    const user = localStore.users.get(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    if (!amountUGX || amountUGX < 1000) {
      throw new Error('Minimum wallet top-up amount is UGX 1,000.');
    }

    // Top-up MUST initiate an authoritative payment through the gateway instead of arbitrary balance injection
    const payment = await PaymentService.processPayment({
      userId,
      referenceType: 'WALLET',
      referenceId: userId,
      amountUgx: amountUGX,
      paymentMethod: paymentMethod || 'MTN_MOMO',
      phone: phone || user.phone,
      customerName: user.full_name,
      customerEmail: user.email,
      description: `Safaris Wallet Top-Up: UGX ${amountUGX.toLocaleString()}`,
    });

    const env = DpoPayGateway.environment;
    const currentBalance = FinancialService.calculateWalletBalance(userId, env);

    return {
      payment: PaymentService.toPublicView(payment),
      walletBalanceUGX: currentBalance,
      message: `Top-up payment initiated via ${paymentMethod}. Approve the prompt on your phone or card to fund your account.`,
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
