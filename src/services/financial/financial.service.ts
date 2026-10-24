import { v4 as uuidv4 } from 'uuid';
import { localStore, db } from '../../config/database';
import { ENV } from '../../config/env';
import { PaymentRecord, PaymentEnvironment } from '../payment/payment.service';
import { broadcastPaymentStream, broadcastFinancialOverview, emitToUser } from '../../realtime/socket_server';
import { LedgerService, toExactUgxBigInt, withOrderedLocks } from './ledger.service';

export interface WalletTransaction {
  id: string;
  user_id: string;
  amount_ugx: number;
  balance_after_ugx: number;
  type: 'CREDIT' | 'DEBIT';
  reference_type: 'DEPOSIT' | 'TRIP' | 'DELIVERY' | 'TOUR' | 'REFUND' | 'ADMIN_ADJUSTMENT' | 'CASHBACK';
  reference_id: string;
  payment_id?: string;
  refund_id?: string;
  ledger_transaction_id?: string;
  environment: PaymentEnvironment;
  idempotency_key?: string;
  description: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface WalletSummary {
  wallet_id: string;
  user_id: string;
  currency: string;
  environment: PaymentEnvironment;
  status: 'ACTIVE' | 'FROZEN' | 'SUSPENDED' | 'COMPLIANCE_RESTRICTED';
  custody_partner_status: string;
  available_balance_ugx: number;
  reserved_balance_ugx: number;
  pending_topups_ugx: number;
  total_verified_deposits_ugx: number;
  total_completed_spending_ugx: number;
  total_refunded_ugx: number;
  updated_at: string;
}

export interface RefundPolicy {
  id: string;
  policy_name: string;
  version_number?: number;
  is_enabled: boolean;
  max_waiting_minutes: number;
  applicable_service_types: string[];
  applicable_payment_methods: string[];
  refund_percentage: number;
  developer_commission_rate?: number;
  platform_commission_rate?: number;
  require_driver_assigned: boolean;
  require_no_arrival: boolean;
  auto_process_enabled: boolean;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export interface RefundRecord {
  id: string;
  refund_reference: string;
  payment_id?: string;
  booking_id?: string;
  trip_id?: string;
  delivery_id?: string;
  user_id: string;
  amount_ugx: number;
  currency: string;
  reason: string;
  refund_method: 'WALLET' | 'ORIGINAL_PAYMENT';
  status: 'REQUESTED' | 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED' | 'MANUAL_REVIEW';
  environment: PaymentEnvironment;
  policy_version?: string;
  policy_snapshot?: Record<string, any>;
  eligibility_evidence?: Record<string, any>;
  dpo_refund_trans_token?: string;
  ledger_transaction_id?: string;
  failure_reason?: string;
  processed_by: string;
  processed_at?: string;
  audit_trail: any[];
  created_at: string;
  updated_at: string;
}

export interface PlatformEarningRecord {
  id: string;
  booking_type: 'TRIP' | 'DELIVERY' | 'TOUR' | 'SHUTTLE';
  booking_id: string;
  milestone_id?: string;
  payment_id?: string;
  payer_user_id?: string;
  beneficiary_id?: string;
  beneficiary_role?: 'driver' | 'tour_guide';
  gross_amount_ugx: number;
  developer_commission_ugx?: number;
  developer_commission_rate?: number;
  platform_commission_ugx: number;
  platform_commission_rate: number;
  beneficiary_earnings_ugx: number;
  payment_method: string;
  environment: PaymentEnvironment;
  status: 'PENDING_MILESTONE' | 'EARNED' | 'REVERSED' | 'REFUNDED' | 'DISPUTED';
  refund_id?: string;
  ledger_transaction_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface FinancialAdjustmentRecord {
  id: string;
  admin_id?: string;
  target_type: 'USER_WALLET' | 'DRIVER_EARNINGS' | 'PLATFORM_RESERVE';
  target_id: string;
  amount_ugx: number;
  adjustment_type: 'CREDIT' | 'DEBIT';
  reason: string;
  ledger_transaction_id?: string;
  environment: PaymentEnvironment;
  created_at: string;
}

export interface FinancialOverview {
  environment: PaymentEnvironment;
  total_verified_payments_ugx: number;
  verified_payments_count: number;
  customer_wallet_liabilities_ugx: number;
  booking_escrow_liabilities_ugx: number;
  platform_commission_earned_ugx: number;
  developer_commission_payable_ugx: number;
  driver_payables_ugx: number;
  guide_payables_ugx: number;
  beneficiary_earnings_payable_ugx: number;
  pending_withdrawals_ugx: number;
  completed_withdrawals_ugx: number;
  dpo_clearing_balance_ugx: number;
  reconciled_settlements_ugx: number;
  gateway_fees_ugx: number;
  total_refunds_processed_ugx: number;
  refunds_processed_count: number;
  active_refund_requests_count: number;
  unreconciled_discrepancies_count: number;
  trial_balance_balanced: boolean;
  reconciliation_difference_ugx: number;
  as_of: string;
}

export class FinancialError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
  }
}

export class FinancialService {
  private static schedulerTimer: NodeJS.Timeout | null = null;

  // ---------------------------------------------------------------------------
  // Default Refund Policy & Policy Versioning
  // ---------------------------------------------------------------------------

  public static async ensureDefaultRefundPolicy(): Promise<RefundPolicy> {
    await LedgerService.initChartOfAccounts();
    const defaultId = 'pol_no_show_default';
    const existing = localStore.refund_policies.get(defaultId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const defaultPolicy: RefundPolicy = {
      id: defaultId,
      policy_name: 'Standard Driver No-Show & Delay Refund Policy',
      version_number: 1,
      is_enabled: true,
      max_waiting_minutes: 15,
      applicable_service_types: ['ride', 'airport_shuttle', 'delivery', 'tour'],
      applicable_payment_methods: ['WALLET', 'CARD', 'MTN_MOMO', 'AIRTEL_MONEY'],
      refund_percentage: 100.0,
      developer_commission_rate: ENV.DEVELOPER_COMMISSION_RATE,
      platform_commission_rate: ENV.PLATFORM_COMMISSION_RATE,
      require_driver_assigned: true,
      require_no_arrival: true,
      auto_process_enabled: true,
      updated_by: 'SYSTEM_INITIALIZER',
      created_at: now,
      updated_at: now,
    };

    await db.persistRefundPolicy(defaultPolicy);
    this.recordPolicyVersion(defaultPolicy, 'SYSTEM_INITIALIZER');
    return defaultPolicy;
  }

  private static recordPolicyVersion(policy: RefundPolicy, createdBy: string) {
    const versionNum = policy.version_number || 1;
    const versionId = `pver_${policy.id}_v${versionNum}`;
    const versionRecord = {
      id: versionId,
      policy_id: policy.id,
      version_number: versionNum,
      policy_name: policy.policy_name,
      max_waiting_minutes: policy.max_waiting_minutes,
      refund_percentage: policy.refund_percentage,
      developer_commission_rate: policy.developer_commission_rate ?? ENV.DEVELOPER_COMMISSION_RATE,
      platform_ride_commission_rate: policy.platform_commission_rate ?? ENV.PLATFORM_COMMISSION_RATE,
      platform_tour_commission_rate: policy.platform_commission_rate ?? ENV.PLATFORM_COMMISSION_RATE,
      rules_snapshot: { ...policy },
      created_by: createdBy,
      created_at: new Date().toISOString(),
    };
    localStore.financial_policy_versions.set(versionId, Object.freeze(versionRecord));
  }

  public static async getRefundPolicies(): Promise<RefundPolicy[]> {
    await this.ensureDefaultRefundPolicy();
    return Array.from(localStore.refund_policies.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  public static async updateRefundPolicy(
    id: string,
    updates: Partial<RefundPolicy>,
    updatedBy = 'ADMIN'
  ): Promise<RefundPolicy> {
    const existing = localStore.refund_policies.get(id);
    if (!existing) {
      throw new FinancialError('POLICY_NOT_FOUND', `Refund policy ${id} does not exist.`, 404);
    }

    const nextVersion = (Number(existing.version_number) || 1) + 1;
    const updated: RefundPolicy = {
      ...existing,
      ...updates,
      id: existing.id,
      version_number: nextVersion,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };

    await db.persistRefundPolicy(updated);
    this.recordPolicyVersion(updated, updatedBy);

    await LedgerService.recordAuditLog({
      actorId: updatedBy,
      actorRole: 'admin',
      action: 'UPDATE_REFUND_POLICY',
      entityType: 'REFUND_POLICY',
      entityId: id,
      previousState: existing,
      newState: updated,
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Wallet Operations (Authoritative Ledger Calculation & Double-Entry Mutations)
  // ---------------------------------------------------------------------------

  /**
   * Authoritatively computes the wallet balance for a user strictly by summing all
   * immutable ledger transactions from `wallet_transactions` in exact BigInt UGX.
   */
  public static calculateWalletBalance(
    userId: string,
    environment: PaymentEnvironment = 'sandbox'
  ): number {
    let balance = 0n;
    for (const tx of localStore.wallet_transactions.values()) {
      if (tx.user_id === userId && tx.environment === environment) {
        const amt = BigInt(Math.round(Number(tx.amount_ugx) || 0));
        if (tx.type === 'CREDIT') {
          balance += amt;
        } else if (tx.type === 'DEBIT') {
          balance -= amt;
        }
      }
    }
    return Number(balance);
  }

  public static getWalletAccountSummary(
    userId: string,
    environment: PaymentEnvironment = 'sandbox'
  ): WalletSummary {
    let totalDeposits = 0n;
    let totalSpending = 0n;
    let totalRefunds = 0n;

    for (const tx of localStore.wallet_transactions.values()) {
      if (tx.user_id === userId && tx.environment === environment) {
        const amt = BigInt(Math.round(Number(tx.amount_ugx) || 0));
        if (tx.type === 'CREDIT') {
          if (tx.reference_type === 'REFUND') totalRefunds += amt;
          else totalDeposits += amt;
        } else if (tx.type === 'DEBIT') {
          totalSpending += amt;
        }
      }
    }

    let pendingTopups = 0n;
    for (const p of localStore.payments.values()) {
      if (
        p.user_id === userId &&
        p.environment === environment &&
        p.reference_type === 'WALLET' &&
        (p.status === 'INITIATED' || p.status === 'PENDING' || p.status === 'PROCESSING')
      ) {
        pendingTopups += BigInt(Math.round(Number(p.amount_ugx) || 0));
      }
    }

    let reservedHolds = 0n;
    for (const h of localStore.wallet_holds.values()) {
      if (h.user_id === userId && h.environment === environment && h.status === 'HELD') {
        reservedHolds += BigInt(Math.round(Number(h.amount_ugx) || 0));
      }
    }

    const available = BigInt(this.calculateWalletBalance(userId, environment)) - reservedHolds;
    const isLiveRestricted = environment === 'production' && (!ENV.WALLET_TOPUPS_ENABLED || !ENV.WALLET_CUSTODY_APPROVED);

    return {
      wallet_id: `wlt_${environment}_${userId}`,
      user_id: userId,
      currency: 'UGX',
      environment,
      status: isLiveRestricted ? 'COMPLIANCE_RESTRICTED' : 'ACTIVE',
      custody_partner_status: ENV.WALLET_CUSTODY_APPROVED ? 'LICENSED_CUSTODY_APPROVED' : 'INTERNAL_LEDGER_ONLY',
      available_balance_ugx: Number(available > 0n ? available : 0n),
      reserved_balance_ugx: Number(reservedHolds),
      pending_topups_ugx: Number(pendingTopups),
      total_verified_deposits_ugx: Number(totalDeposits),
      total_completed_spending_ugx: Number(totalSpending),
      total_refunded_ugx: Number(totalRefunds),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Atomic credit to customer wallet with double-entry ledger posting and immutable wallet_transactions entry.
   */
  public static async creditWallet(params: {
    userId: string;
    amountUgx: number;
    type: 'DEPOSIT' | 'REFUND' | 'ADMIN_ADJUSTMENT' | 'CASHBACK';
    referenceType: 'DEPOSIT' | 'TRIP' | 'DELIVERY' | 'TOUR' | 'REFUND' | 'ADMIN_ADJUSTMENT' | 'CASHBACK';
    referenceId: string;
    paymentId?: string;
    refundId?: string;
    sourceAccountCode?: string;
    sourceOwnerId?: string;
    environment?: PaymentEnvironment;
    idempotencyKey?: string;
    description: string;
    metadata?: Record<string, any>;
  }): Promise<{ transaction: WalletTransaction; balance: number }> {
    const {
      userId,
      type,
      referenceType,
      referenceId,
      paymentId,
      refundId,
      environment = 'sandbox',
      idempotencyKey,
      description,
      metadata = {},
    } = params;

    // Enforce National Payment Systems Act / Bank of Uganda custody compliance for live stored-value deposits
    if (environment === 'production' && type === 'DEPOSIT') {
      if (!ENV.WALLET_TOPUPS_ENABLED || !ENV.WALLET_CUSTODY_APPROVED) {
        throw new FinancialError(
          'WALLET_CUSTODY_APPROVAL_REQUIRED',
          'Live customer stored-value wallet top-ups are disabled until licensed custody partner approval is enabled (WALLET_TOPUPS_ENABLED=true and WALLET_CUSTODY_APPROVED=true).',
          403
        );
      }
    }

    let amountBig: bigint;
    try {
      amountBig = toExactUgxBigInt(params.amountUgx);
    } catch (err: any) {
      throw new FinancialError('INVALID_AMOUNT', err.message || 'Credit amount must be a positive integer in UGX.', 400);
    }
    const amountUgx = Number(amountBig);

    const lockKeys = [
      `wallet:${environment}:${userId}`,
      ...(idempotencyKey ? [`wtx_idem:${idempotencyKey}`] : []),
    ];

    return withOrderedLocks(lockKeys, async () => {
      // 1. Verify user exists
      const user = localStore.users.get(userId);
      if (!user) {
        throw new FinancialError('USER_NOT_FOUND', `User ${userId} not found.`, 404);
      }

      // 2. Check idempotency (prevent duplicate credits from duplicate callbacks or retries)
      for (const tx of localStore.wallet_transactions.values()) {
        if (
          tx.user_id === userId &&
          tx.environment === environment &&
          ((idempotencyKey && tx.idempotency_key === idempotencyKey) ||
            (paymentId && tx.payment_id === paymentId && tx.type === 'CREDIT' && type === 'DEPOSIT') ||
            (refundId && tx.refund_id === refundId && tx.type === 'CREDIT'))
        ) {
          const currentBal = this.calculateWalletBalance(userId, environment);
          return { transaction: tx, balance: currentBal };
        }
      }

      // 3. Post Double-Entry Ledger Transaction:
      // DEBIT Source Clearing/Escrow/Adjustment Account -> CREDIT 2010_CUSTOMER_WALLET_LIABILITY
      const sourceAccountCode =
        params.sourceAccountCode ||
        (type === 'DEPOSIT'
          ? '1010_GATEWAY_CLEARING_DPO'
          : type === 'REFUND'
          ? '2020_BOOKING_ESCROW_LIABILITY'
          : '3010_PLATFORM_ADJUSTMENT_CLEARING');

      const ledgerTx = await LedgerService.postTransaction({
        eventId: `evt_wallet_credit_${environment}_${type}_${referenceId}_${paymentId || refundId || idempotencyKey || uuidv4()}`,
        idempotencyKey: idempotencyKey ? `ltx_credit_${idempotencyKey}` : undefined,
        transactionType: `WALLET_CREDIT_${type}`,
        referenceType,
        referenceId,
        environment,
        description: description || `Wallet credited with ${amountUgx} UGX (${type})`,
        postedBy: userId,
        entries: [
          {
            accountCode: sourceAccountCode,
            ownerId: params.sourceOwnerId || 'PLATFORM',
            direction: 'DEBIT',
            amountUgx: amountBig,
          },
          {
            accountCode: '2010_CUSTOMER_WALLET_LIABILITY',
            ownerId: userId,
            direction: 'CREDIT',
            amountUgx: amountBig,
          },
        ],
        metadata: { userId, paymentId, refundId, ...metadata },
      });

      // 4. Compute new balance authoritatively from ledger
      const currentBalance = this.calculateWalletBalance(userId, environment);
      const newBalance = currentBalance + amountUgx;

      const tx: WalletTransaction = {
        id: `wtx_${Date.now()}_${uuidv4().substring(0, 8)}`,
        user_id: userId,
        amount_ugx: amountUgx,
        balance_after_ugx: newBalance,
        type: 'CREDIT',
        reference_type: referenceType,
        reference_id: referenceId,
        payment_id: paymentId,
        refund_id: refundId,
        ledger_transaction_id: ledgerTx.id,
        environment,
        idempotency_key: idempotencyKey,
        description: description || `Wallet credited with ${amountUgx} UGX (${type})`,
        metadata: { ...metadata, ledgerTransactionId: ledgerTx.id },
        created_at: new Date().toISOString(),
      };

      // 5. Persist immutable ledger record
      await db.persistWalletTransaction(tx);

      // 6. Update user cached balance
      user.wallet_balance_ugx = newBalance;
      user.sandbox_wallet_balance_ugx = newBalance;
      user.updated_at = new Date().toISOString();
      await db.persistUser(user);

      // 7. Broadcast real-time updates
      emitToUser(userId, 'wallet:balance_update', {
        userId,
        balance_ugx: newBalance,
        environment,
        transaction: tx,
      });

      const overview = this.getFinancialOverview(environment);
      broadcastFinancialOverview(overview);

      return { transaction: tx, balance: newBalance };
    });
  }

  /**
   * Atomic debit from customer wallet with balance check, double-entry ledger posting, and immutable ledger entry.
   */
  public static async debitWallet(params: {
    userId: string;
    amountUgx: number;
    referenceType: 'TRIP' | 'DELIVERY' | 'TOUR' | 'ADMIN_ADJUSTMENT';
    referenceId: string;
    environment?: PaymentEnvironment;
    idempotencyKey?: string;
    description: string;
    metadata?: Record<string, any>;
  }): Promise<{ transaction: WalletTransaction; balance: number }> {
    const {
      userId,
      referenceType,
      referenceId,
      environment = 'sandbox',
      idempotencyKey,
      description,
      metadata = {},
    } = params;

    let amountBig: bigint;
    try {
      amountBig = toExactUgxBigInt(params.amountUgx);
    } catch (err: any) {
      throw new FinancialError('INVALID_AMOUNT', err.message || 'Debit amount must be a positive integer in UGX.', 400);
    }
    const amountUgx = Number(amountBig);

    const lockKeys = [
      `wallet:${environment}:${userId}`,
      ...(idempotencyKey ? [`wtx_idem:${idempotencyKey}`] : []),
    ];

    return withOrderedLocks(lockKeys, async () => {
      const user = localStore.users.get(userId);
      if (!user) {
        throw new FinancialError('USER_NOT_FOUND', `User ${userId} not found.`, 404);
      }

      // Check idempotency
      if (idempotencyKey) {
        for (const tx of localStore.wallet_transactions.values()) {
          if (tx.idempotency_key === idempotencyKey && tx.user_id === userId && tx.environment === environment) {
            const currentBal = this.calculateWalletBalance(userId, environment);
            return { transaction: tx, balance: currentBal };
          }
        }
      }

      const currentBalance = this.calculateWalletBalance(userId, environment);
      if (currentBalance < amountUgx) {
        throw new FinancialError(
          'INSUFFICIENT_WALLET_FUNDS',
          `Insufficient wallet balance. Available: ${currentBalance} UGX, Required: ${amountUgx} UGX.`,
          400
        );
      }

      // Post Double-Entry Ledger Transaction:
      // DEBIT 2010_CUSTOMER_WALLET_LIABILITY (userId) -> CREDIT 2020_BOOKING_ESCROW_LIABILITY (or Adjustment Clearing)
      const destAccountCode =
        referenceType === 'ADMIN_ADJUSTMENT'
          ? '3010_PLATFORM_ADJUSTMENT_CLEARING'
          : '2020_BOOKING_ESCROW_LIABILITY';

      const ledgerTx = await LedgerService.postTransaction({
        eventId: `evt_wallet_debit_${environment}_${referenceType}_${referenceId}_${idempotencyKey || uuidv4()}`,
        idempotencyKey: idempotencyKey ? `ltx_debit_${idempotencyKey}` : undefined,
        transactionType: `WALLET_DEBIT_${referenceType}`,
        referenceType,
        referenceId,
        environment,
        description: description || `Payment of ${amountUgx} UGX for ${referenceType} #${referenceId}`,
        postedBy: userId,
        entries: [
          {
            accountCode: '2010_CUSTOMER_WALLET_LIABILITY',
            ownerId: userId,
            direction: 'DEBIT',
            amountUgx: amountBig,
          },
          {
            accountCode: destAccountCode,
            ownerId: referenceType === 'ADMIN_ADJUSTMENT' ? 'PLATFORM' : referenceId,
            direction: 'CREDIT',
            amountUgx: amountBig,
          },
        ],
        metadata: { userId, referenceType, referenceId, ...metadata },
      });

      const newBalance = currentBalance - amountUgx;

      const tx: WalletTransaction = {
        id: `wtx_${Date.now()}_${uuidv4().substring(0, 8)}`,
        user_id: userId,
        amount_ugx: amountUgx,
        balance_after_ugx: newBalance,
        type: 'DEBIT',
        reference_type: referenceType,
        reference_id: referenceId,
        ledger_transaction_id: ledgerTx.id,
        environment,
        idempotency_key: idempotencyKey,
        description: description || `Payment of ${amountUgx} UGX for ${referenceType} #${referenceId}`,
        metadata: { ...metadata, ledgerTransactionId: ledgerTx.id },
        created_at: new Date().toISOString(),
      };

      // Persist immutable ledger record
      await db.persistWalletTransaction(tx);

      // Update user cached balance
      user.wallet_balance_ugx = newBalance;
      user.sandbox_wallet_balance_ugx = newBalance;
      user.updated_at = new Date().toISOString();
      await db.persistUser(user);

      // Broadcast real-time updates
      emitToUser(userId, 'wallet:balance_update', {
        userId,
        balance_ugx: newBalance,
        environment,
        transaction: tx,
      });

      const overview = this.getFinancialOverview(environment);
      broadcastFinancialOverview(overview);

      return { transaction: tx, balance: newBalance };
    });
  }

  /**
   * Retrieves all wallet ledger transactions for a user, sorted descending by created_at.
   */
  public static getWalletLedger(
    userId: string,
    environment?: PaymentEnvironment
  ): WalletTransaction[] {
    const list: WalletTransaction[] = [];
    for (const tx of localStore.wallet_transactions.values()) {
      if (tx.user_id === userId) {
        if (!environment || tx.environment === environment) {
          list.push(tx);
        }
      }
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // ---------------------------------------------------------------------------
  // Booking Escrow, Platform Earnings & Contractual 5% Developer Commission
  // ---------------------------------------------------------------------------

  /**
   * Records a verified DPO payment for a booking into Booking Escrow (`2020_BOOKING_ESCROW_LIABILITY`).
   * Ensures customer payment is held as a liability until earned by service completion.
   */
  public static async recordBookingPaymentEscrow(params: {
    paymentId: string;
    bookingType: 'TRIP' | 'DELIVERY' | 'TOUR' | 'SHUTTLE';
    bookingId: string;
    payerUserId: string;
    amountUgx: number;
    environment?: PaymentEnvironment;
  }) {
    const {
      paymentId,
      bookingType,
      bookingId,
      payerUserId,
      environment = 'sandbox',
    } = params;
    const amountBig = toExactUgxBigInt(params.amountUgx);

    return LedgerService.postTransaction({
      eventId: `evt_dpo_booking_escrow_${paymentId}`,
      idempotencyKey: `ltx_escrow_${paymentId}`,
      transactionType: 'BOOKING_PAYMENT_ESCROW',
      referenceType: bookingType,
      referenceId: bookingId,
      environment,
      description: `Verified DPO payment ${paymentId} held in booking escrow for ${bookingType} #${bookingId}`,
      postedBy: payerUserId,
      entries: [
        { accountCode: '1010_GATEWAY_CLEARING_DPO', ownerId: 'PLATFORM', direction: 'DEBIT', amountUgx: amountBig },
        { accountCode: '2020_BOOKING_ESCROW_LIABILITY', ownerId: bookingId, direction: 'CREDIT', amountUgx: amountBig },
      ],
      metadata: { paymentId, bookingType, bookingId, payerUserId },
    });
  }

  /**
   * Allocates and posts earned revenue and beneficiary payables for a completed booking or tour milestone.
   * Explicitly separates:
   * - Contractual 5% Developer Commission (`2050_DEVELOPER_COMMISSION_PAYABLE`)
   * - SAFARIS Platform Commission (`4010_SAFARIS_COMMISSION_REVENUE`)
   * - Driver (`2030_DRIVER_PAYABLE`) or Tour Guide (`2040_GUIDE_PAYABLE`) Net Earnings
   * Enforces: developerCommissionUgx + platformCommissionUgx + beneficiaryEarningsUgx === grossAmountUgx
   */
  public static async recordPlatformEarning(params: {
    bookingType: 'TRIP' | 'DELIVERY' | 'TOUR' | 'SHUTTLE';
    bookingId: string;
    milestoneId?: string;
    paymentId?: string;
    payerUserId?: string;
    beneficiaryId?: string;
    beneficiaryRole?: 'driver' | 'tour_guide';
    grossAmountUgx: number;
    commissionRate?: number; // Total or platform commission rate; default uses contractual 5% developer commission
    developerCommissionRate?: number;
    platformCommissionRate?: number;
    paymentMethod: string;
    environment?: PaymentEnvironment;
    metadata?: Record<string, any>;
  }): Promise<PlatformEarningRecord> {
    const {
      bookingType,
      bookingId,
      milestoneId = 'FULL_COMPLETION',
      paymentId,
      payerUserId,
      beneficiaryId,
      paymentMethod,
      environment = 'sandbox',
      metadata = {},
    } = params;

    const beneficiaryRole: 'driver' | 'tour_guide' =
      params.beneficiaryRole || (bookingType === 'TOUR' ? 'tour_guide' : 'driver');

    const grossBig = toExactUgxBigInt(Math.round(Number(params.grossAmountUgx)));

    // Resolve developer commission (default 5%) and platform commission rates
    const devRate =
      params.developerCommissionRate !== undefined
        ? Number(params.developerCommissionRate)
        : ENV.DEVELOPER_COMMISSION_RATE; // 5%

    let platRate =
      params.platformCommissionRate !== undefined
        ? Number(params.platformCommissionRate)
        : params.commissionRate !== undefined
        ? Math.max(0, Number(params.commissionRate) - devRate)
        : ENV.PLATFORM_COMMISSION_RATE;

    if (devRate < 0 || platRate < 0 || devRate + platRate > 100) {
      throw new FinancialError(
        'INVALID_COMMISSION_SPLIT',
        `Combined developer (${devRate}%) and platform (${platRate}%) commissions cannot exceed 100%.`
      );
    }

    // Exact integer minor-unit (UGX) allocation using basis points (1% = 100 bps)
    const devBps = BigInt(Math.round(devRate * 100));
    const platBps = BigInt(Math.round(platRate * 100));

    const devCommBig = (grossBig * devBps) / 10_000n;
    const platCommBig = (grossBig * platBps) / 10_000n;
    const beneficiaryNetBig = grossBig - devCommBig - platCommBig;

    const dedupeKey = `${environment}:${bookingType}:${bookingId}:${milestoneId}`;

    return withOrderedLocks([`earning:${dedupeKey}`], async () => {
      // Idempotency check: prevent duplicate commission/earning recognition for the same booking milestone
      for (const existing of localStore.platform_earnings.values()) {
        if (
          existing.environment === environment &&
          existing.booking_type === bookingType &&
          existing.booking_id === bookingId &&
          (existing.milestone_id || 'FULL_COMPLETION') === milestoneId &&
          existing.status === 'EARNED'
        ) {
          return existing as PlatformEarningRecord;
        }
      }

      // Ensure booking escrow exists if recordPlatformEarning was called directly for a DPO payment
      const escrowBal = LedgerService.getAccountBalance('2020_BOOKING_ESCROW_LIABILITY', bookingId, environment);
      if (escrowBal < Number(grossBig) && paymentMethod !== 'WALLET') {
        await LedgerService.postTransaction({
          eventId: `evt_auto_escrow_${dedupeKey}`,
          idempotencyKey: `ltx_auto_escrow_${dedupeKey}`,
          transactionType: 'BOOKING_PAYMENT_ESCROW',
          referenceType: bookingType,
          referenceId: bookingId,
          environment,
          description: `Verified DPO payment escrow for ${bookingType} #${bookingId}`,
          postedBy: payerUserId || 'SYSTEM',
          entries: [
            { accountCode: '1010_GATEWAY_CLEARING_DPO', ownerId: 'PLATFORM', direction: 'DEBIT', amountUgx: grossBig },
            { accountCode: '2020_BOOKING_ESCROW_LIABILITY', ownerId: bookingId, direction: 'CREDIT', amountUgx: grossBig },
          ],
          metadata: { paymentId, bookingId },
        });
      }

      const payableCode = beneficiaryRole === 'tour_guide' ? '2040_GUIDE_PAYABLE' : '2030_DRIVER_PAYABLE';
      const ledgerEntries: Array<{ accountCode: string; ownerId?: string; direction: 'DEBIT' | 'CREDIT'; amountUgx: bigint }> = [
        { accountCode: '2020_BOOKING_ESCROW_LIABILITY', ownerId: bookingId, direction: 'DEBIT', amountUgx: grossBig },
      ];

      if (beneficiaryNetBig > 0n) {
        ledgerEntries.push({
          accountCode: payableCode,
          ownerId: beneficiaryId || 'UNASSIGNED_POOL',
          direction: 'CREDIT',
          amountUgx: beneficiaryNetBig,
        });
      }
      if (devCommBig > 0n) {
        ledgerEntries.push({
          accountCode: '2050_DEVELOPER_COMMISSION_PAYABLE',
          ownerId: 'DEVELOPER',
          direction: 'CREDIT',
          amountUgx: devCommBig,
        });
      }
      if (platCommBig > 0n) {
        ledgerEntries.push({
          accountCode: '4010_SAFARIS_COMMISSION_REVENUE',
          ownerId: 'PLATFORM',
          direction: 'CREDIT',
          amountUgx: platCommBig,
        });
      }

      const ledgerTx = await LedgerService.postTransaction({
        eventId: `evt_earning_${dedupeKey}`,
        idempotencyKey: `ltx_earning_${dedupeKey}`,
        transactionType: 'BOOKING_EARNINGS_ALLOCATION',
        referenceType: bookingType,
        referenceId: bookingId,
        environment,
        description: `Earnings & commission allocation for ${bookingType} #${bookingId} (${milestoneId})`,
        postedBy: 'FINANCIAL_ENGINE',
        entries: ledgerEntries,
        metadata: {
          paymentId,
          beneficiaryId,
          beneficiaryRole,
          grossUgx: Number(grossBig),
          developerCommissionUgx: Number(devCommBig),
          platformCommissionUgx: Number(platCommBig),
          beneficiaryNetUgx: Number(beneficiaryNetBig),
        },
      });

      const totalCommUgx = Number(devCommBig + platCommBig);
      const totalCommRate = devRate + platRate;

      const earning: PlatformEarningRecord = {
        id: `earn_${Date.now()}_${uuidv4().substring(0, 6)}`,
        booking_type: bookingType,
        booking_id: bookingId,
        milestone_id: milestoneId,
        payment_id: paymentId,
        payer_user_id: payerUserId,
        beneficiary_id: beneficiaryId,
        beneficiary_role: beneficiaryRole,
        gross_amount_ugx: Number(grossBig),
        developer_commission_ugx: Number(devCommBig),
        developer_commission_rate: devRate,
        platform_commission_ugx: totalCommUgx,
        platform_commission_rate: totalCommRate,
        beneficiary_earnings_ugx: Number(beneficiaryNetBig),
        payment_method: paymentMethod,
        environment,
        status: 'EARNED',
        ledger_transaction_id: ledgerTx.id,
        metadata: {
          ...metadata,
          developerCommissionUgx: Number(devCommBig),
          safarisPlatformCommissionUgx: Number(platCommBig),
          ledgerTransactionId: ledgerTx.id,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      localStore.commission_records.set(earning.id, {
        id: earning.id,
        booking_type: bookingType,
        booking_id: bookingId,
        milestone_id: milestoneId,
        payment_id: paymentId,
        beneficiary_id: beneficiaryId,
        beneficiary_role: beneficiaryRole,
        gross_amount_ugx: Number(grossBig),
        developer_commission_rate: devRate,
        developer_commission_ugx: Number(devCommBig),
        platform_commission_rate: platRate,
        platform_commission_ugx: Number(platCommBig),
        beneficiary_net_ugx: Number(beneficiaryNetBig),
        currency: 'UGX',
        status: 'EARNED',
        ledger_transaction_id: ledgerTx.id,
        environment,
        created_at: earning.created_at,
        updated_at: earning.updated_at,
      });

      await db.persistPlatformEarning(earning);

      // Update driver's cached today_earnings_ugx with net earned amount (never fictitious/unpaid)
      if (beneficiaryId && localStore.drivers.has(beneficiaryId)) {
        const driver = localStore.drivers.get(beneficiaryId);
        driver.today_earnings_ugx = (Number(driver.today_earnings_ugx) || 0) + Number(beneficiaryNetBig);
        driver.updated_at = new Date().toISOString();
        await db.persistDriver(driver);
      }

      const overview = this.getFinancialOverview(environment);
      broadcastFinancialOverview(overview);

      return earning;
    });
  }

  /**
   * Milestone-based earnings recognition for multi-day Safari tours (Phase 7).
   * Allocates the proportionate day/leg share of the verified tour booking amount upon leg completion.
   */
  public static async recognizeTourLegMilestoneEarning(params: {
    bookingId: string;
    legNumber: number;
    totalLegs: number;
    guideId: string;
    environment?: PaymentEnvironment;
  }): Promise<PlatformEarningRecord> {
    const { bookingId, legNumber, totalLegs, guideId, environment = 'sandbox' } = params;
    const booking = localStore.tour_bookings.get(bookingId);
    if (!booking) {
      throw new FinancialError('BOOKING_NOT_FOUND', `Tour booking ${bookingId} not found.`, 404);
    }
    if (booking.payment_status !== 'PAID' && booking.payment_status !== 'COMPLETED') {
      throw new FinancialError('BOOKING_UNPAID', `Cannot recognize tour earnings before booking ${bookingId} is paid.`, 400);
    }
    if (legNumber < 1 || legNumber > totalLegs || totalLegs < 1) {
      throw new FinancialError('INVALID_MILESTONE', `Invalid tour leg ${legNumber} of ${totalLegs}.`, 400);
    }

    const totalBig = toExactUgxBigInt(Math.round(Number(booking.total_ugx || 0)));
    const legsBig = BigInt(totalLegs);
    const basePerLeg = totalBig / legsBig;
    const remainder = totalBig % legsBig;
    const legGrossBig = BigInt(legNumber) === legsBig ? basePerLeg + remainder : basePerLeg;

    return this.recordPlatformEarning({
      bookingType: 'TOUR',
      bookingId,
      milestoneId: `LEG_${legNumber}_OF_${totalLegs}`,
      payerUserId: booking.customer_id,
      beneficiaryId: guideId,
      beneficiaryRole: 'tour_guide',
      grossAmountUgx: Number(legGrossBig),
      paymentMethod: booking.payment_method || 'MTN_MOMO',
      environment,
    });
  }

  // ---------------------------------------------------------------------------
  // Configurable Automatic No-Show Refund Evaluator & Controlled Execution
  // ---------------------------------------------------------------------------

  public static evaluateNoShowRefundEligibility(
    bookingType: 'TRIP' | 'TOUR' | 'DELIVERY',
    bookingId: string
  ): {
    eligible: boolean;
    reason?: string;
    refundAmountUgx: number;
    payment?: PaymentRecord;
    policySnapshot?: RefundPolicy;
    evidence?: Record<string, any>;
  } {
    let booking: any = null;
    let userId = '';
    let createdAt = '';
    let driverId = '';
    let driverArrivedAt: string | null = null;
    let status = '';

    if (bookingType === 'TRIP') {
      booking = localStore.trips.get(bookingId);
      if (booking) {
        userId = booking.rider_id || booking.user_id || booking.customer_id;
        createdAt = booking.driver_assigned_at || booking.created_at;
        driverId = booking.driver_id;
        driverArrivedAt = booking.driver_arrived_at || null;
        status = booking.status;
      }
    } else if (bookingType === 'TOUR') {
      booking = localStore.tour_bookings.get(bookingId);
      if (booking) {
        userId = booking.customer_id;
        createdAt = booking.created_at;
        driverId = booking.guide_id || booking.tour_guide_id;
        status = booking.status || booking.booking_status;
      }
    } else if (bookingType === 'DELIVERY') {
      booking = localStore.deliveries.get(bookingId);
      if (booking) {
        userId = booking.customer_id;
        createdAt = booking.created_at;
        driverId = booking.courier_id;
        status = booking.status;
      }
    }

    if (!booking) {
      return { eligible: false, reason: 'Booking record not found.', refundAmountUgx: 0 };
    }

    let payment: PaymentRecord | undefined;
    for (const p of localStore.payments.values()) {
      if (
        p.reference_id === bookingId &&
        p.status === 'SUCCESSFUL' &&
        (!p.refund_status || p.refund_status === 'NONE')
      ) {
        payment = p;
        break;
      }
    }

    if (!payment) {
      return { eligible: false, reason: 'No unrefunded verified payment found for booking.', refundAmountUgx: 0 };
    }

    // Use policy snapshot attached to booking if present so new policy changes never retroactively alter existing bookings
    let policy: RefundPolicy | undefined = booking.policy_snapshot;
    if (!policy) {
      for (const pol of localStore.refund_policies.values()) {
        if (pol.is_enabled) {
          policy = pol;
          break;
        }
      }
    }
    if (!policy) {
      return { eligible: false, reason: 'No active refund policy configured.', refundAmountUgx: 0 };
    }

    const now = Date.now();
    const bookingTime = new Date(createdAt).getTime();
    const elapsedMinutes = Math.floor((now - bookingTime) / (60 * 1000));

    if (policy.require_no_arrival && driverArrivedAt) {
      return {
        eligible: false,
        reason: 'Driver arrived at pickup location; no-show policy does not apply.',
        refundAmountUgx: 0,
      };
    }

    if (policy.require_driver_assigned && !driverId) {
      if (elapsedMinutes < policy.max_waiting_minutes) {
        return {
          eligible: false,
          reason: `Driver search in progress (${elapsedMinutes} / ${policy.max_waiting_minutes} mins).`,
          refundAmountUgx: 0,
        };
      }
    }

    if (elapsedMinutes < policy.max_waiting_minutes && status !== 'CANCELLED') {
      return {
        eligible: false,
        reason: `Waiting period not elapsed (${elapsedMinutes} / ${policy.max_waiting_minutes} mins).`,
        refundAmountUgx: 0,
      };
    }

    const refundPercentage = Number(policy.refund_percentage) || 100.0;
    const refundAmountUgx = Math.round(Number(payment.amount_ugx) * (refundPercentage / 100.0));

    const evidence = {
      booking_id: bookingId,
      booking_type: bookingType,
      user_id: userId,
      driver_id: driverId || 'NONE_ASSIGNED',
      driver_arrived_at: driverArrivedAt,
      elapsed_minutes: elapsedMinutes,
      threshold_minutes: policy.max_waiting_minutes,
      booking_status: status,
      payment_id: payment.id,
      payment_amount_ugx: payment.amount_ugx,
      evaluated_at: new Date().toISOString(),
    };

    return {
      eligible: true,
      reason: `Driver did not arrive within ${policy.max_waiting_minutes} minutes waiting period.`,
      refundAmountUgx,
      payment,
      policySnapshot: policy,
      evidence,
    };
  }

  /**
   * Executes a controlled refund (REQUESTED -> APPROVED -> PROCESSING -> COMPLETED / MANUAL_REVIEW).
   * Prevents duplicate refunds and ensures cumulative refunds never exceed the original verified payment amount.
   */
  public static async processRefund(params: {
    paymentId?: string;
    bookingId?: string;
    tripId?: string;
    deliveryId?: string;
    userId: string;
    amountUgx: number;
    reason: string;
    refundMethod?: 'WALLET' | 'ORIGINAL_PAYMENT';
    environment?: PaymentEnvironment;
    policyVersion?: string;
    policySnapshot?: Record<string, any>;
    eligibilityEvidence?: Record<string, any>;
    processedBy?: string;
    idempotencyKey?: string;
    notes?: string;
  }): Promise<RefundRecord> {
    const {
      paymentId,
      bookingId,
      tripId,
      deliveryId,
      userId,
      reason,
      refundMethod = 'WALLET',
      environment = 'sandbox',
      policyVersion = '1.0',
      policySnapshot = {},
      eligibilityEvidence = {},
      processedBy = 'SYSTEM_AUTO_WORKER',
      idempotencyKey,
      notes,
    } = params;

    let amountBig: bigint;
    try {
      amountBig = toExactUgxBigInt(params.amountUgx);
    } catch (err: any) {
      throw new FinancialError('INVALID_REFUND_AMOUNT', err.message || 'Refund amount must be a positive integer in UGX.', 400);
    }
    const amountUgx = Number(amountBig);

    const effRefId = paymentId || bookingId || tripId || deliveryId || userId;
    const lockKeys = [
      `refund_ref:${environment}:${effRefId}`,
      ...(idempotencyKey ? [`refund_idem:${idempotencyKey}`] : []),
    ];

    return withOrderedLocks(lockKeys, async () => {
      // 1. Idempotency check
      if (idempotencyKey) {
        for (const r of localStore.refunds.values()) {
          if ((r as any).idempotency_key === idempotencyKey) {
            return r as RefundRecord;
          }
        }
      }

      // 2. Locate payment and prevent duplicate / excessive refunds
      const targetPayment = paymentId
        ? localStore.payments.get(paymentId)
        : Array.from(localStore.payments.values()).find(
            (p) =>
              p.status === 'SUCCESSFUL' &&
              p.environment === environment &&
              (p.reference_id === bookingId || p.reference_id === tripId || p.reference_id === deliveryId)
          );

      if (targetPayment) {
        const originalPaid = Math.round(Number(targetPayment.amount_ugx || 0));
        let alreadyRefunded = 0;
        for (const r of localStore.refunds.values()) {
          if (
            (r.payment_id === targetPayment.id ||
              (bookingId && r.booking_id === bookingId) ||
              (tripId && r.trip_id === tripId)) &&
            (r.status === 'COMPLETED' || r.status === 'PROCESSING' || r.status === 'APPROVED')
          ) {
            alreadyRefunded += Math.round(Number(r.amount_ugx || 0));
          }
        }

        if (alreadyRefunded >= originalPaid) {
          throw new FinancialError(
            'ALREADY_REFUNDED',
            `Payment ${targetPayment.id} has already been fully refunded (${originalPaid} UGX).`,
            409
          );
        }

        if (alreadyRefunded + amountUgx > originalPaid) {
          throw new FinancialError(
            'OVER_REFUND_BLOCKED',
            `Refund of ${amountUgx} UGX would exceed refundable balance (${originalPaid - alreadyRefunded} UGX remaining of ${originalPaid} UGX).`,
            409
          );
        }
      }

      const refundId = `ref_${Date.now()}_${uuidv4().substring(0, 6)}`;
      const refundRef = `REF-${Date.now().toString().slice(-6)}-${uuidv4().substring(0, 4).toUpperCase()}`;
      const now = new Date().toISOString();

      const refund: RefundRecord & { idempotency_key?: string } = {
        id: refundId,
        refund_reference: refundRef,
        payment_id: targetPayment?.id || paymentId,
        booking_id: bookingId,
        trip_id: tripId,
        delivery_id: deliveryId,
        user_id: userId,
        amount_ugx: amountUgx,
        currency: 'UGX',
        reason,
        refund_method: refundMethod,
        status: 'REQUESTED',
        environment,
        policy_version: policyVersion,
        policy_snapshot: policySnapshot,
        eligibility_evidence: eligibilityEvidence,
        processed_by: processedBy,
        processed_at: now,
        idempotency_key: idempotencyKey,
        audit_trail: [
          { at: now, event: 'REQUESTED', by: processedBy, reason, notes },
          { at: now, event: 'APPROVED', by: processedBy, reason: 'Policy & balance verified' },
        ],
        created_at: now,
        updated_at: now,
      };

      refund.status = 'PROCESSING';
      refund.audit_trail.push({ at: new Date().toISOString(), event: 'PROCESSING', by: processedBy });

      // 3. Reverse or adjust platform earnings if previously recognized for this booking
      const effTripId = tripId || (bookingId && localStore.trips.has(bookingId) ? bookingId : null);
      let reversedFromEarnings = false;

      for (const earning of localStore.platform_earnings.values()) {
        if (
          (earning.booking_id === bookingId || earning.booking_id === effTripId) &&
          earning.status === 'EARNED' &&
          earning.ledger_transaction_id
        ) {
          const earnGross = Math.round(Number(earning.gross_amount_ugx));
          if (amountUgx === earnGross) {
            await LedgerService.reverseTransaction({
              originalTransactionId: earning.ledger_transaction_id,
              reason: `Refund ${refundRef}: ${reason}`,
              actorId: processedBy,
              eventId: `evt_rev_earning_${refundId}`,
            });
            reversedFromEarnings = true;
          } else if (amountUgx > 0 && amountUgx < earnGross) {
            const refundBig = BigInt(amountUgx);
            const grossBig = BigInt(earnGross);
            const origDevBig = BigInt(Math.round(Number(earning.developer_commission_ugx || 0)));
            const origSafarisComm = Math.round(
              Number(
                earning.metadata?.safarisPlatformCommissionUgx ??
                  Number(earning.platform_commission_ugx || 0) - Number(earning.developer_commission_ugx || 0)
              )
            );
            const origPlatBig = BigInt(Math.max(0, origSafarisComm));
            const devClawbackBig = (origDevBig * refundBig) / grossBig;
            const platClawbackBig = (origPlatBig * refundBig) / grossBig;
            const benClawbackBig = refundBig - devClawbackBig - platClawbackBig;

            const payableCode = earning.beneficiary_role === 'tour_guide' ? '2040_GUIDE_PAYABLE' : '2030_DRIVER_PAYABLE';
            const clawbackEntries: Array<{ accountCode: string; ownerId?: string; direction: 'DEBIT' | 'CREDIT'; amountUgx: bigint }> = [
              {
                accountCode: '2020_BOOKING_ESCROW_LIABILITY',
                ownerId: earning.booking_id,
                direction: 'CREDIT',
                amountUgx: refundBig,
              },
            ];
            if (benClawbackBig > 0n) {
              clawbackEntries.push({
                accountCode: payableCode,
                ownerId: earning.beneficiary_id || 'UNASSIGNED_POOL',
                direction: 'DEBIT',
                amountUgx: benClawbackBig,
              });
            }
            if (devClawbackBig > 0n) {
              clawbackEntries.push({
                accountCode: '2050_DEVELOPER_COMMISSION_PAYABLE',
                ownerId: 'DEVELOPER',
                direction: 'DEBIT',
                amountUgx: devClawbackBig,
              });
            }
            if (platClawbackBig > 0n) {
              clawbackEntries.push({
                accountCode: '4010_SAFARIS_COMMISSION_REVENUE',
                ownerId: 'PLATFORM',
                direction: 'DEBIT',
                amountUgx: platClawbackBig,
              });
            }

            await LedgerService.postTransaction({
              eventId: `evt_partial_clawback_${refundId}`,
              idempotencyKey: `ltx_partial_clawback_${refundId}`,
              transactionType: 'PARTIAL_EARNINGS_CLAWBACK',
              referenceType: earning.booking_type,
              referenceId: earning.booking_id,
              environment,
              description: `Proportional earnings & commission clawback for partial refund ${refundRef}`,
              postedBy: processedBy,
              entries: clawbackEntries,
              metadata: {
                refundId,
                earningId: earning.id,
                refundUgx: amountUgx,
                beneficiaryClawbackUgx: Number(benClawbackBig),
                developerClawbackUgx: Number(devClawbackBig),
                platformClawbackUgx: Number(platClawbackBig),
              },
            });
            reversedFromEarnings = true;
          }
          earning.status = 'REFUNDED';
          earning.refund_id = refundId;
          earning.updated_at = new Date().toISOString();
          await db.persistPlatformEarning(earning);

          const commRec = localStore.commission_records.get(earning.id);
          if (commRec) {
            commRec.status = 'REVERSED';
            commRec.updated_at = earning.updated_at;
          }
        }
      }

      // 4. Credit customer wallet (or mark MANUAL_REVIEW if external original-payment refund is required in production)
      if (refundMethod === 'ORIGINAL_PAYMENT' && environment === 'production') {
        refund.status = 'MANUAL_REVIEW';
        refund.audit_trail.push({
          at: new Date().toISOString(),
          event: 'MANUAL_REVIEW',
          note: 'Original DPO payment refund queued for authorized gateway settlement reversal.',
        });
      } else {
        try {
          const creditRes = await this.creditWallet({
            userId,
            amountUgx,
            type: 'REFUND',
            referenceType: 'REFUND',
            referenceId: refundId,
            paymentId: refund.payment_id,
            refundId,
            sourceAccountCode: '2020_BOOKING_ESCROW_LIABILITY',
            sourceOwnerId: bookingId || effTripId || deliveryId || 'PLATFORM',
            environment,
            idempotencyKey: idempotencyKey ? `wtx_ref_${idempotencyKey}` : `wtx_ref_${refundId}`,
            description: `Refund of ${amountUgx} UGX (${reason}) credited to Safaris Wallet`,
            metadata: { refundRef, reason, bookingId, tripId, deliveryId, reversedFromEarnings },
          });

          refund.status = 'COMPLETED';
          refund.ledger_transaction_id = creditRes.transaction.ledger_transaction_id;
          refund.audit_trail.push({
            at: new Date().toISOString(),
            event: 'COMPLETED',
            amountUgx,
            ledgerTransactionId: refund.ledger_transaction_id,
          });
        } catch (err: any) {
          refund.status = 'FAILED';
          refund.failure_reason = err.message || 'Failed to credit customer wallet.';
          refund.audit_trail.push({
            at: new Date().toISOString(),
            event: 'FAILED',
            error: refund.failure_reason,
          });
        }
      }

      // 5. Persist refund
      await db.persistRefund(refund);

      // 6. Update payment record if exists
      if (refund.payment_id && localStore.payments.has(refund.payment_id)) {
        const payment = localStore.payments.get(refund.payment_id);
        const totalRefundedNow = (Number(payment.refunded_amount_ugx) || 0) + (refund.status === 'COMPLETED' ? amountUgx : 0);
        payment.refunded_amount_ugx = totalRefundedNow;
        payment.refund_status =
          refund.status === 'COMPLETED'
            ? totalRefundedNow >= Number(payment.amount_ugx)
              ? 'REFUNDED'
              : 'PENDING'
            : 'PENDING';
        payment.refund_id = refundId;
        payment.updated_at = new Date().toISOString();
        await db.persistPayment(payment);
        broadcastPaymentStream(payment, 'payment:refunded');
      }

      // 7. Update trip/booking status if applicable
      if (effTripId && localStore.trips.has(effTripId)) {
        const trip = localStore.trips.get(effTripId);
        trip.refund_status = refund.status === 'COMPLETED' ? 'REFUNDED' : 'PENDING';
        trip.refunded_amount_ugx = (Number(trip.refunded_amount_ugx) || 0) + amountUgx;
        trip.refund_id = refundId;
        if (
          refund.status === 'COMPLETED' &&
          (reason.toUpperCase().includes('NO_SHOW') || reason.toLowerCase().includes('waiting period') || processedBy === 'AUTOMATIC_NO_SHOW_REFUND_WORKER')
        ) {
          trip.status = 'CANCELLED_NO_SHOW';
        }
        trip.updated_at = new Date().toISOString();
        await db.persistTrip(trip);
      }

      const overview = this.getFinancialOverview(environment);
      broadcastFinancialOverview(overview);

      return refund;
    });
  }

  public static async runAutomaticRefundWorker(): Promise<{
    evaluated: number;
    refunded: number;
    errors: number;
  }> {
    const defaultPolicy = await this.ensureDefaultRefundPolicy();
    if (!defaultPolicy.is_enabled || !defaultPolicy.auto_process_enabled) {
      return { evaluated: 0, refunded: 0, errors: 0 };
    }

    let evaluated = 0;
    let refunded = 0;
    let errors = 0;

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const trip of localStore.trips.values()) {
      const tripTime = new Date(trip.created_at || '').getTime();
      if (tripTime < oneDayAgo) continue;

      if (trip.payment_status === 'PAID' && (!trip.refund_status || trip.refund_status === 'NONE')) {
        evaluated++;
        try {
          const evalResult = this.evaluateNoShowRefundEligibility('TRIP', trip.id);
          if (evalResult.eligible && evalResult.payment) {
            await this.processRefund({
              paymentId: evalResult.payment.id,
              bookingId: trip.id,
              tripId: trip.id,
              userId: evalResult.payment.user_id,
              amountUgx: evalResult.refundAmountUgx,
              reason: evalResult.reason || 'NO_SHOW_DRIVER',
              refundMethod: 'WALLET',
              environment: evalResult.payment.environment,
              policyVersion: String(evalResult.policySnapshot?.version_number || '1.0'),
              policySnapshot: evalResult.policySnapshot as any,
              eligibilityEvidence: evalResult.evidence,
              processedBy: 'AUTOMATIC_NO_SHOW_REFUND_WORKER',
              idempotencyKey: `auto_noshow_${trip.id}`,
              notes: 'Automatically processed by Safaris Financial Engine No-Show Worker.',
            });
            refunded++;
          }
        } catch (err: any) {
          errors++;
          console.error(`[FinancialService Worker] Error evaluating refund for trip ${trip.id}:`, err);
        }
      }
    }

    return { evaluated, refunded, errors };
  }

  public static startRefundScheduler(intervalMs = 60000) {
    if (this.schedulerTimer || intervalMs <= 0) return;
    this.schedulerTimer = setInterval(() => {
      this.runAutomaticRefundWorker().catch((err) =>
        console.warn('[FinancialService] Scheduler notice:', err.message)
      );
    }, intervalMs);
    this.schedulerTimer.unref?.();
  }

  public static stopRefundScheduler() {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Financial Overview & Double-Entry Trial Balance (Admin Dashboard)
  // ---------------------------------------------------------------------------

  public static getFinancialOverview(environment: PaymentEnvironment = 'sandbox'): FinancialOverview {
    let totalVerifiedPayments = 0;
    let verifiedPaymentsCount = 0;

    for (const p of localStore.payments.values()) {
      if (p.environment === environment && p.status === 'SUCCESSFUL' && !p.duplicate_of_payment_id) {
        totalVerifiedPayments += Number(p.amount_ugx) || 0;
        verifiedPaymentsCount++;
      }
    }

    let customerWalletLiabilities = 0;
    for (const u of localStore.users.values()) {
      const bal = this.calculateWalletBalance(u.id, environment);
      if (bal > 0) {
        customerWalletLiabilities += bal;
      }
    }

    let platformCommissionEarned = 0;
    let developerCommissionPayable = 0;
    let driverPayables = 0;
    let guidePayables = 0;

    for (const e of localStore.platform_earnings.values()) {
      if (e.environment === environment && e.status === 'EARNED') {
        const devComm = Number(e.developer_commission_ugx || 0);
        const totalComm = Number(e.platform_commission_ugx || 0);
        developerCommissionPayable += devComm;
        platformCommissionEarned += Math.max(0, totalComm - devComm);
      }
    }

    for (const proj of localStore.account_balance_projections.values()) {
      if (proj.environment !== environment) continue;
      if (proj.account_code === '2030_DRIVER_PAYABLE' && proj.net_balance_ugx > 0) {
        driverPayables += Number(proj.net_balance_ugx);
      } else if (proj.account_code === '2040_GUIDE_PAYABLE' && proj.net_balance_ugx > 0) {
        guidePayables += Number(proj.net_balance_ugx);
      }
    }

    const beneficiaryEarningsPayable = driverPayables + guidePayables;

    let pendingWithdrawals = 0;
    let completedWithdrawals = 0;
    for (const w of localStore.payout_requests.values()) {
      if (w.environment === environment) {
        if (w.status === 'COMPLETED') {
          completedWithdrawals += Number(w.amount_ugx || 0);
        } else if (['REQUESTED', 'APPROVED', 'PROCESSING', 'UNCERTAIN_TIMEOUT', 'MANUAL_DISBURSEMENT_REQUIRED'].includes(w.status)) {
          pendingWithdrawals += Number(w.amount_ugx || 0);
        }
      }
    }

    let totalRefundsProcessed = 0;
    let refundsProcessedCount = 0;
    let activeRefundRequests = 0;

    for (const r of localStore.refunds.values()) {
      if (r.environment === environment) {
        if (r.status === 'COMPLETED') {
          totalRefundsProcessed += Number(r.amount_ugx) || 0;
          refundsProcessedCount++;
        } else if (['REQUESTED', 'PENDING', 'APPROVED', 'PROCESSING', 'MANUAL_REVIEW'].includes(r.status)) {
          activeRefundRequests++;
        }
      }
    }

    const trial = LedgerService.verifyTrialBalance(environment);
    const dpoClearingBalance = trial.accountBalances['1010_GATEWAY_CLEARING_DPO'] || 0;
    const reconciledSettlements = trial.accountBalances['1030_SETTLEMENT_BANK_ACCOUNT'] || 0;
    const gatewayFees = trial.accountBalances['5010_GATEWAY_FEE_EXPENSE'] || 0;
    const bookingEscrowLiabilities = trial.accountBalances['2020_BOOKING_ESCROW_LIABILITY'] || 0;

    let openDiscrepancies = 0;
    for (const d of localStore.reconciliation_discrepancies.values()) {
      if (d.environment === environment && d.status === 'OPEN') {
        openDiscrepancies++;
      }
    }

    const reconciliationDiff = trial.totalDebitsUgx - trial.totalCreditsUgx;

    return {
      environment,
      total_verified_payments_ugx: Math.round(totalVerifiedPayments),
      verified_payments_count: verifiedPaymentsCount,
      customer_wallet_liabilities_ugx: Math.round(customerWalletLiabilities),
      booking_escrow_liabilities_ugx: Math.round(bookingEscrowLiabilities),
      platform_commission_earned_ugx: Math.round(platformCommissionEarned),
      developer_commission_payable_ugx: Math.round(developerCommissionPayable),
      driver_payables_ugx: Math.round(driverPayables),
      guide_payables_ugx: Math.round(guidePayables),
      beneficiary_earnings_payable_ugx: Math.round(beneficiaryEarningsPayable),
      pending_withdrawals_ugx: Math.round(pendingWithdrawals),
      completed_withdrawals_ugx: Math.round(completedWithdrawals),
      dpo_clearing_balance_ugx: Math.round(dpoClearingBalance),
      reconciled_settlements_ugx: Math.round(reconciledSettlements),
      gateway_fees_ugx: Math.round(gatewayFees),
      total_refunds_processed_ugx: Math.round(totalRefundsProcessed),
      refunds_processed_count: refundsProcessedCount,
      active_refund_requests_count: activeRefundRequests,
      unreconciled_discrepancies_count: openDiscrepancies,
      trial_balance_balanced: trial.balanced,
      reconciliation_difference_ugx: Math.round(reconciliationDiff),
      as_of: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Financial Adjustments (Authorized Compensating Ledger Entries + Audit)
  // ---------------------------------------------------------------------------

  public static async recordFinancialAdjustment(params: {
    adminId: string;
    targetType: 'USER_WALLET' | 'DRIVER_EARNINGS' | 'PLATFORM_RESERVE';
    targetId: string;
    amountUgx: number;
    adjustmentType: 'CREDIT' | 'DEBIT';
    reason: string;
    environment?: PaymentEnvironment;
  }): Promise<FinancialAdjustmentRecord> {
    const {
      adminId,
      targetType,
      targetId,
      amountUgx,
      adjustmentType,
      reason,
      environment = 'sandbox',
    } = params;

    let amountBig: bigint;
    try {
      amountBig = toExactUgxBigInt(amountUgx);
    } catch (err: any) {
      throw new FinancialError('INVALID_AMOUNT', err.message || 'Adjustment amount must be a positive integer in UGX.', 400);
    }
    const roundedAmount = Number(amountBig);

    const adj: FinancialAdjustmentRecord = {
      id: `fadj_${Date.now()}_${uuidv4().substring(0, 6)}`,
      admin_id: adminId,
      target_type: targetType,
      target_id: targetId,
      amount_ugx: roundedAmount,
      adjustment_type: adjustmentType,
      reason,
      environment,
      created_at: new Date().toISOString(),
    };

    if (targetType === 'USER_WALLET') {
      if (adjustmentType === 'CREDIT') {
        const res = await this.creditWallet({
          userId: targetId,
          amountUgx: roundedAmount,
          type: 'ADMIN_ADJUSTMENT',
          referenceType: 'ADMIN_ADJUSTMENT',
          referenceId: adj.id,
          environment,
          description: `Admin adjustment (+${roundedAmount} UGX): ${reason}`,
          metadata: { adminId, adjustmentId: adj.id },
        });
        adj.ledger_transaction_id = res.transaction.ledger_transaction_id;
      } else {
        const res = await this.debitWallet({
          userId: targetId,
          amountUgx: roundedAmount,
          referenceType: 'ADMIN_ADJUSTMENT',
          referenceId: adj.id,
          environment,
          description: `Admin adjustment (-${roundedAmount} UGX): ${reason}`,
          metadata: { adminId, adjustmentId: adj.id },
        });
        adj.ledger_transaction_id = res.transaction.ledger_transaction_id;
      }
    } else if (targetType === 'DRIVER_EARNINGS') {
      const ltx = await LedgerService.postTransaction({
        eventId: `evt_adj_drv_${adj.id}`,
        idempotencyKey: `ltx_adj_${adj.id}`,
        transactionType: 'ADMIN_DRIVER_EARNINGS_ADJUSTMENT',
        referenceType: 'ADMIN_ADJUSTMENT',
        referenceId: adj.id,
        environment,
        description: `Admin driver earnings adjustment (${adjustmentType} ${roundedAmount} UGX): ${reason}`,
        postedBy: adminId,
        entries:
          adjustmentType === 'CREDIT'
            ? [
                { accountCode: '3010_PLATFORM_ADJUSTMENT_CLEARING', ownerId: 'PLATFORM', direction: 'DEBIT', amountUgx: amountBig },
                { accountCode: '2030_DRIVER_PAYABLE', ownerId: targetId, direction: 'CREDIT', amountUgx: amountBig },
              ]
            : [
                { accountCode: '2030_DRIVER_PAYABLE', ownerId: targetId, direction: 'DEBIT', amountUgx: amountBig },
                { accountCode: '3010_PLATFORM_ADJUSTMENT_CLEARING', ownerId: 'PLATFORM', direction: 'CREDIT', amountUgx: amountBig },
              ],
      });
      adj.ledger_transaction_id = ltx.id;
    }

    await db.persistFinancialAdjustment(adj);

    await LedgerService.recordAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: `FINANCIAL_ADJUSTMENT_${adjustmentType}`,
      entityType: targetType,
      entityId: targetId,
      amountUgx: roundedAmount,
      reason,
      newState: adj,
      environment,
    });

    return adj;
  }
}
