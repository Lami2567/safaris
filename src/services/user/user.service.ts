import { v4 as uuidv4 } from 'uuid';
import { localStore, db } from '../../config/database';
import { AuthService } from '../auth/auth.service';
import { FinancialService } from '../financial/financial.service';
import { DpoPayGateway } from '../payment/dpo_gateway';
import { PaymentService } from '../payment/payment.service';

export const ALLOWED_ROLES = ['customer', 'driver', 'tour_guide', 'admin'] as const;
export type UserRole = (typeof ALLOWED_ROLES)[number];

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

  public static async updateProfile(userId: string, data: any) {
    const user = localStore.users.get(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    // STRICT ALLOWLIST: Reject or strip any privilege/ledger fields
    // Protected fields: role, wallet_balance_ugx, is_verified, approval_status, password_hash, rating, total_trips, id
    if (data.role !== undefined && data.role !== user.role) {
      throw new Error('Modification of account role through profile update is strictly prohibited.');
    }
    if (data.wallet_balance_ugx !== undefined || data.walletBalanceUGX !== undefined) {
      throw new Error('Wallet balance cannot be modified through profile update.');
    }
    if (data.is_verified !== undefined || data.approval_status !== undefined) {
      throw new Error('Verification and approval status can only be updated by authorized administrators.');
    }
    if (data.password_hash !== undefined || data.password !== undefined) {
      throw new Error('Password changes must use the secure password update endpoint.');
    }

    // Apply allowed profile updates only
    const fullName = data.fullName || data.full_name;
    if (typeof fullName === 'string' && fullName.trim()) {
      user.full_name = fullName.trim();
    }

    const phone = data.phone;
    if (typeof phone === 'string' && phone.trim()) {
      user.phone = phone.trim();
    }

    const email = data.email;
    if (typeof email === 'string' && email.trim() && email.trim().toLowerCase() !== (user.email || '').toLowerCase()) {
      const cleanEmail = email.trim().toLowerCase();
      // Ensure no collision with another user
      for (const [id, u] of localStore.users.entries()) {
        if (id !== userId && (u.email || '').toLowerCase() === cleanEmail) {
          throw new Error('Email address is already in use by another account.');
        }
      }
      user.email = cleanEmail;
    }

    const avatarUrl = data.avatarUrl || data.avatar_url;
    if (typeof avatarUrl === 'string') {
      user.avatar_url = avatarUrl.trim();
    }

    user.updated_at = new Date().toISOString();
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

  /**
   * Controlled administrative role change with audit trail and allowlist validation.
   */
  public static async adminChangeUserRole(params: {
    targetUserId: string;
    newRole: string;
    adminId: string;
    ipAddress?: string;
    reason?: string;
  }) {
    const { targetUserId, newRole, adminId, ipAddress = '127.0.0.1', reason = 'Admin role change' } = params;

    if (!ALLOWED_ROLES.includes(newRole as any)) {
      throw new Error(`Invalid role '${newRole}'. Allowed roles: ${ALLOWED_ROLES.join(', ')}.`);
    }

    const user = localStore.users.get(targetUserId);
    if (!user) {
      throw new Error('Target user account not found.');
    }

    const previousRole = user.role || 'customer';

    // Driver and Tour Guide accounts must have an approved recruitment application
    if (newRole === 'driver') {
      const driver = localStore.drivers.get(targetUserId);
      if (!driver || driver.is_approved !== true || driver.approval_status !== 'APPROVED') {
        throw new Error(
          "Cannot assign 'driver' role to user without an approved driver recruitment application on file."
        );
      }
    }

    if (newRole === 'tour_guide') {
      const guide = localStore.tour_guides.get(targetUserId);
      if (!guide || guide.is_approved !== true || guide.approval_status !== 'APPROVED') {
        throw new Error(
          "Cannot assign 'tour_guide' role to user without an approved tour guide recruitment application on file."
        );
      }
    }

    user.role = newRole;
    user.auth_version = uuidv4();
    user.token_version = (Number(user.token_version) || 1) + 1;
    user.updated_at = new Date().toISOString();
    await db.persistUser(user);

    // Record immutable audit entry
    const auditId = `audit_role_${Date.now()}_${uuidv4().slice(0, 6)}`;
    const auditEntry = {
      id: auditId,
      admin_id: adminId,
      action: 'ADMIN_ROLE_CHANGE',
      resource_type: 'USER',
      resource_id: targetUserId,
      details: {
        targetUserId,
        targetUserEmail: user.email,
        targetUserName: user.full_name,
        previousRole,
        newRole,
        reason,
      },
      ip_address: ipAddress,
      created_at: new Date().toISOString(),
    };

    localStore.admin_audit_logs.set(auditId, auditEntry);
    if (db.isPostgresConnected) {
      db.query(
        `INSERT INTO admin_audit_logs (id, admin_id, action, resource_type, resource_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [auditId, adminId, 'ADMIN_ROLE_CHANGE', 'USER', targetUserId, JSON.stringify(auditEntry.details), ipAddress]
      ).catch(() => {});
    }

    console.log(`[UserService] Role updated for ${user.email}: ${previousRole} -> ${newRole} by admin ${adminId}`);

    return {
      success: true,
      user: AuthService.sanitizeUser(user),
      previousRole,
      newRole,
      auditId,
    };
  }

  /**
   * Deprecated public role-switch method: Fails closed for unauthorized users.
   */
  public static async switchRole(userId: string, newRole: string) {
    throw new Error('Unrestricted role switching is disabled. Customers cannot grant themselves elevated privileges.');
  }

  /**
   * Read-only report of all accounts holding privileged roles.
   */
  public static async getPrivilegedAccountsReport() {
    const report: any[] = [];
    for (const u of localStore.users.values()) {
      if (['admin', 'driver', 'tour_guide'].includes(u.role)) {
        const driver = localStore.drivers.get(u.id);
        const guide = localStore.tour_guides.get(u.id);
        report.push({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          phone: u.phone,
          role: u.role,
          is_verified: u.is_verified === true,
          approval_status: u.approval_status || 'PENDING',
          created_at: u.created_at,
          has_driver_profile: !!driver,
          has_guide_profile: !!guide,
          driver_approved: driver?.is_approved === true,
          guide_approved: guide?.is_approved === true,
        });
      }
    }
    return {
      timestamp: new Date().toISOString(),
      totalPrivilegedAccounts: report.length,
      admins: report.filter(r => r.role === 'admin').length,
      drivers: report.filter(r => r.role === 'driver').length,
      tourGuides: report.filter(r => r.role === 'tour_guide').length,
      accounts: report,
    };
  }
}
