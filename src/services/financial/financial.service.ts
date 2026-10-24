import { v4 as uuidv4 } from 'uuid';
import { localStore, db } from '../../config/database';
import { PaymentRecord, PaymentEnvironment } from '../payment/payment.service';
import { broadcastPaymentStream, broadcastFinancialOverview, emitToUser } from '../../realtime/socket_server';

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
  environment: PaymentEnvironment;
  idempotency_key?: string;
  description: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface RefundPolicy {
  id: string;
  policy_name: string;
  is_enabled: boolean;
  max_waiting_minutes: number;
  applicable_service_types: string[];
  applicable_payment_methods: string[];
  refund_percentage: number;
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
  status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'FAILED';
  environment: PaymentEnvironment;
  policy_version?: string;
  policy_snapshot?: Record<string, any>;
  eligibility_evidence?: Record<string, any>;
  dpo_refund_trans_token?: string;
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
  payment_id?: string;
  payer_user_id?: string;
  beneficiary_id?: string;
  gross_amount_ugx: number;
  platform_commission_ugx: number;
  platform_commission_rate: number;
  beneficiary_earnings_ugx: number;
  payment_method: string;
  environment: PaymentEnvironment;
  status: 'EARNED' | 'REVERSED' | 'REFUNDED';
  refund_id?: string;
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
  environment: PaymentEnvironment;
  created_at: string;
}

export interface FinancialOverview {
  environment: PaymentEnvironment;
  total_verified_payments_ugx: number;
  verified_payments_count: number;
  customer_wallet_liabilities_ugx: number;
  platform_commission_earned_ugx: number;
  beneficiary_earnings_payable_ugx: number;
  total_refunds_processed_ugx: number;
  refunds_processed_count: number;
  active_refund_requests_count: number;
  reconciliation_difference_ugx: number;
  as_of: string;
}

export class FinancialError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
  }
}

// In-memory user-level mutex to prevent race conditions on balance updates
const userMutexes = new Map<string, Promise<void>>();

async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const current = userMutexes.get(userId) || Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  userMutexes.set(userId, current.then(() => next));

  try {
    await current;
    return await fn();
  } finally {
    release!();
    if (userMutexes.get(userId) === next) {
      userMutexes.delete(userId);
    }
  }
}

export class FinancialService {
  private static schedulerTimer: NodeJS.Timeout | null = null;

  // ---------------------------------------------------------------------------
  // Default Refund Policy Initialization
  // ---------------------------------------------------------------------------

  public static async ensureDefaultRefundPolicy(): Promise<RefundPolicy> {
    const defaultId = 'pol_no_show_default';
    const existing = localStore.refund_policies.get(defaultId);
    if (existing) {
      return existing;
    }

    const defaultPolicy: RefundPolicy = {
      id: defaultId,
      policy_name: 'Standard Driver No-Show & Delay Refund Policy',
      is_enabled: true,
      max_waiting_minutes: 15,
      applicable_service_types: ['ride', 'airport_shuttle', 'delivery', 'tour'],
      applicable_payment_methods: ['WALLET', 'CARD', 'MTN_MOMO', 'AIRTEL_MONEY'],
      refund_percentage: 100.0,
      require_driver_assigned: true,
      require_no_arrival: true,
      auto_process_enabled: true,
      updated_by: 'SYSTEM_INITIALIZER',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.persistRefundPolicy(defaultPolicy);
    return defaultPolicy;
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

    const updated: RefundPolicy = {
      ...existing,
      ...updates,
      id: existing.id,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };

    await db.persistRefundPolicy(updated);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Wallet Operations (Authoritative Ledger Calculation & Mutations)
  // ---------------------------------------------------------------------------

  /**
   * Authoritatively computes the wallet balance for a user strictly by summing all
   * immutable ledger transactions from `wallet_transactions` for the given environment.
   */
  public static calculateWalletBalance(
    userId: string,
    environment: PaymentEnvironment = 'sandbox'
  ): number {
    let balance = 0;
    for (const tx of localStore.wallet_transactions.values()) {
      if (tx.user_id === userId && tx.environment === environment) {
        const amt = Number(tx.amount_ugx) || 0;
        if (tx.type === 'CREDIT') {
          balance += amt;
        } else if (tx.type === 'DEBIT') {
          balance -= amt;
        }
      }
    }
    return Math.round(balance);
  }

  /**
   * Atomic credit to customer wallet with immutable ledger entry and user cache update.
   */
  public static async creditWallet(params: {
    userId: string;
    amountUgx: number;
    type: 'DEPOSIT' | 'REFUND' | 'ADMIN_ADJUSTMENT' | 'CASHBACK';
    referenceType: 'DEPOSIT' | 'TRIP' | 'DELIVERY' | 'TOUR' | 'REFUND' | 'ADMIN_ADJUSTMENT' | 'CASHBACK';
    referenceId: string;
    paymentId?: string;
    refundId?: string;
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

    const amountUgx = Math.round(Number(params.amountUgx));
    if (!Number.isFinite(amountUgx) || amountUgx <= 0) {
      throw new FinancialError('INVALID_AMOUNT', 'Credit amount must be a positive integer in UGX.', 400);
    }

    return withUserLock(userId, async () => {
      // 1. Verify user exists
      const user = localStore.users.get(userId);
      if (!user) {
        throw new FinancialError('USER_NOT_FOUND', `User ${userId} not found.`, 404);
      }

      // 2. Check idempotency
      if (idempotencyKey) {
        for (const tx of localStore.wallet_transactions.values()) {
          if (tx.idempotency_key === idempotencyKey && tx.user_id === userId) {
            const currentBal = this.calculateWalletBalance(userId, environment);
            return { transaction: tx, balance: currentBal };
          }
        }
      }

      // 3. Compute new balance authoritatively from ledger
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
        environment,
        idempotency_key: idempotencyKey,
        description: description || `Wallet credited with ${amountUgx} UGX (${type})`,
        metadata,
        created_at: new Date().toISOString(),
      };

      // 4. Persist immutable ledger record
      await db.persistWalletTransaction(tx);

      // 5. Update user cached balance
      user.wallet_balance_ugx = newBalance;
      user.sandbox_wallet_balance_ugx = newBalance;
      user.updated_at = new Date().toISOString();
      await db.persistUser(user);

      // 6. Broadcast real-time updates
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
   * Atomic debit from customer wallet with balance check and immutable ledger entry.
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

    const amountUgx = Math.round(Number(params.amountUgx));
    if (!Number.isFinite(amountUgx) || amountUgx <= 0) {
      throw new FinancialError('INVALID_AMOUNT', 'Debit amount must be a positive integer in UGX.', 400);
    }

    return withUserLock(userId, async () => {
      const user = localStore.users.get(userId);
      if (!user) {
        throw new FinancialError('USER_NOT_FOUND', `User ${userId} not found.`, 404);
      }

      // Check idempotency
      if (idempotencyKey) {
        for (const tx of localStore.wallet_transactions.values()) {
          if (tx.idempotency_key === idempotencyKey && tx.user_id === userId) {
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

      const newBalance = currentBalance - amountUgx;

      const tx: WalletTransaction = {
        id: `wtx_${Date.now()}_${uuidv4().substring(0, 8)}`,
        user_id: userId,
        amount_ugx: amountUgx,
        balance_after_ugx: newBalance,
        type: 'DEBIT',
        reference_type: referenceType,
        reference_id: referenceId,
        environment,
        idempotency_key: idempotencyKey,
        description: description || `Payment of ${amountUgx} UGX for ${referenceType} #${referenceId}`,
        metadata,
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
  // Platform Earnings & Commissions Ledger
  // ---------------------------------------------------------------------------

  public static async recordPlatformEarning(params: {
    bookingType: 'TRIP' | 'DELIVERY' | 'TOUR' | 'SHUTTLE';
    bookingId: string;
    paymentId?: string;
    payerUserId?: string;
    beneficiaryId?: string;
    grossAmountUgx: number;
    commissionRate?: number; // e.g. 15 for 15%
    paymentMethod: string;
    environment?: PaymentEnvironment;
    metadata?: Record<string, any>;
  }): Promise<PlatformEarningRecord> {
    const {
      bookingType,
      bookingId,
      paymentId,
      payerUserId,
      beneficiaryId,
      paymentMethod,
      environment = 'sandbox',
      metadata = {},
    } = params;

    const grossAmountUgx = Math.round(Number(params.grossAmountUgx));
    const commissionRate = params.commissionRate !== undefined ? Number(params.commissionRate) : 15.0; // Default 15%
    const platformCommissionUgx = Math.round(grossAmountUgx * (commissionRate / 100));
    const beneficiaryEarningsUgx = grossAmountUgx - platformCommissionUgx;

    const earning: PlatformEarningRecord = {
      id: `earn_${Date.now()}_${uuidv4().substring(0, 6)}`,
      booking_type: bookingType,
      booking_id: bookingId,
      payment_id: paymentId,
      payer_user_id: payerUserId,
      beneficiary_id: beneficiaryId,
      gross_amount_ugx: grossAmountUgx,
      platform_commission_ugx: platformCommissionUgx,
      platform_commission_rate: commissionRate,
      beneficiary_earnings_ugx: beneficiaryEarningsUgx,
      payment_method: paymentMethod,
      environment,
      status: 'EARNED',
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.persistPlatformEarning(earning);

    // If beneficiary is a driver, update their driver today earnings cache
    if (beneficiaryId && localStore.drivers.has(beneficiaryId)) {
      const driver = localStore.drivers.get(beneficiaryId);
      driver.today_earnings_ugx = (Number(driver.today_earnings_ugx) || 0) + beneficiaryEarningsUgx;
      driver.updated_at = new Date().toISOString();
      await db.persistDriver(driver);
    }

    const overview = this.getFinancialOverview(environment);
    broadcastFinancialOverview(overview);

    return earning;
  }

  // ---------------------------------------------------------------------------
  // Configurable Automatic No-Show Refund Evaluator & Execution
  // ---------------------------------------------------------------------------

  /**
   * Evaluates whether a trip or booking qualifies for a no-show automatic refund based on the
   * administrator's configured policy.
   *
   * Criteria:
   * 1. Booking has a verified successful payment.
   * 2. Has not already been refunded.
   * 3. Driver was assigned, but never registered an arrival event (`driver_arrived_at`).
   * 4. Time elapsed from pickup/request time exceeds `policy.max_waiting_minutes` (default 15m).
   */
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
    // 1. Fetch booking record
    let booking: any = null;
    let userId = '';
    let createdAt = '';
    let driverId = '';
    let driverArrivedAt: string | null = null;
    let status = '';

    if (bookingType === 'TRIP') {
      booking = localStore.trips.get(bookingId);
      if (booking) {
        userId = booking.rider_id || booking.user_id;
        createdAt = booking.created_at;
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

    // 2. Find successful payment for this booking
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

    // 3. Check active refund policy
    let policy: RefundPolicy | undefined;
    for (const pol of localStore.refund_policies.values()) {
      if (pol.is_enabled) {
        policy = pol;
        break;
      }
    }
    if (!policy) {
      return { eligible: false, reason: 'No active refund policy configured.', refundAmountUgx: 0 };
    }

    // 4. Verify no-show conditions
    const now = Date.now();
    const bookingTime = new Date(createdAt).getTime();
    const elapsedMinutes = Math.floor((now - bookingTime) / (60 * 1000));

    // If driver arrived, no-show refund is not applicable
    if (policy.require_no_arrival && driverArrivedAt) {
      return {
        eligible: false,
        reason: 'Driver arrived at pickup location; no-show policy does not apply.',
        refundAmountUgx: 0,
      };
    }

    // If policy requires driver assigned
    if (policy.require_driver_assigned && !driverId) {
      // Driver was never assigned; if trip cancelled/stalled past waiting minutes, eligible as unfulfilled
      if (elapsedMinutes < policy.max_waiting_minutes) {
        return {
          eligible: false,
          reason: `Driver search in progress (${elapsedMinutes} / ${policy.max_waiting_minutes} mins).`,
          refundAmountUgx: 0,
        };
      }
    }

    // Check waiting minutes threshold
    if (elapsedMinutes < policy.max_waiting_minutes && status !== 'CANCELLED') {
      return {
        eligible: false,
        reason: `Waiting period not elapsed (${elapsedMinutes} / ${policy.max_waiting_minutes} mins).`,
        refundAmountUgx: 0,
      };
    }

    // Calculate refund amount according to policy %
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
   * Executes a refund for a customer, crediting their wallet or original payment method,
   * updating booking/payment refund statuses, and recording an immutable audit trail.
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
      notes,
    } = params;

    const amountUgx = Math.round(Number(params.amountUgx));
    if (!Number.isFinite(amountUgx) || amountUgx <= 0) {
      throw new FinancialError('INVALID_REFUND_AMOUNT', 'Refund amount must be a positive integer in UGX.', 400);
    }

    const refundId = `ref_${Date.now()}_${uuidv4().substring(0, 6)}`;
    const refundRef = `REF-${Date.now().toString().slice(-6)}-${uuidv4().substring(0, 4).toUpperCase()}`;
    const now = new Date().toISOString();

    const refund: RefundRecord = {
      id: refundId,
      refund_reference: refundRef,
      payment_id: paymentId,
      booking_id: bookingId,
      trip_id: tripId,
      delivery_id: deliveryId,
      user_id: userId,
      amount_ugx: amountUgx,
      currency: 'UGX',
      reason,
      refund_method: refundMethod,
      status: 'PENDING',
      environment,
      policy_version: policyVersion,
      policy_snapshot: policySnapshot,
      eligibility_evidence: eligibilityEvidence,
      processed_by: processedBy,
      processed_at: now,
      audit_trail: [
        {
          at: now,
          event: 'refund_initiated',
          by: processedBy,
          reason,
          notes,
        },
      ],
      created_at: now,
      updated_at: now,
    };

    // 1. Execute wallet credit (safe, immediate, resilient)
    if (refundMethod === 'WALLET' || refundMethod === 'ORIGINAL_PAYMENT') {
      try {
        await this.creditWallet({
          userId,
          amountUgx,
          type: 'REFUND',
          referenceType: 'REFUND',
          referenceId: refundId,
          paymentId,
          refundId,
          environment,
          description: `Refund of ${amountUgx} UGX (${reason}) credited to Safaris Wallet`,
          metadata: { refundRef, reason, bookingId, tripId, deliveryId },
        });

        refund.status = 'COMPLETED';
        refund.audit_trail.push({
          at: new Date().toISOString(),
          event: 'wallet_credit_completed',
          amountUgx,
        });
      } catch (err: any) {
        refund.status = 'FAILED';
        refund.failure_reason = err.message || 'Failed to credit customer wallet.';
        refund.audit_trail.push({
          at: new Date().toISOString(),
          event: 'wallet_credit_failed',
          error: refund.failure_reason,
        });
      }
    }

    // 2. Persist refund
    await db.persistRefund(refund);

    // 3. Update payment record if exists
    if (paymentId && localStore.payments.has(paymentId)) {
      const payment = localStore.payments.get(paymentId);
      payment.refund_status = refund.status === 'COMPLETED' ? 'REFUNDED' : 'PENDING';
      payment.refunded_amount_ugx = (Number(payment.refunded_amount_ugx) || 0) + amountUgx;
      payment.refund_id = refundId;
      payment.updated_at = new Date().toISOString();
      await db.persistPayment(payment);
      broadcastPaymentStream(payment, 'payment:refunded');
    }

    // 4. Update trip/booking status if applicable
    const effTripId = tripId || (bookingId && localStore.trips.has(bookingId) ? bookingId : null);
    if (effTripId && localStore.trips.has(effTripId)) {
      const trip = localStore.trips.get(effTripId);
      trip.refund_status = refund.status === 'COMPLETED' ? 'REFUNDED' : 'PENDING';
      trip.refunded_amount_ugx = amountUgx;
      trip.refund_id = refundId;
      trip.updated_at = new Date().toISOString();
      await db.persistTrip(trip);
    }

    // 5. Reverse or adjust platform earnings if previously recorded
    for (const earning of localStore.platform_earnings.values()) {
      if (
        (earning.booking_id === bookingId || earning.booking_id === effTripId) &&
        earning.status === 'EARNED'
      ) {
        earning.status = 'REFUNDED';
        earning.refund_id = refundId;
        earning.updated_at = new Date().toISOString();
        await db.persistPlatformEarning(earning);
      }
    }

    // 6. Broadcast real-time overview
    const overview = this.getFinancialOverview(environment);
    broadcastFinancialOverview(overview);

    return refund;
  }

  /**
   * Background automatic refund worker.
   * Scans open/cancelled trips from the past 24 hours and evaluates whether any qualify
   * for an automated no-show refund under the active policy.
   */
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

      // Only check paid trips that have not been refunded
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
              policyVersion: '1.0',
              policySnapshot: evalResult.policySnapshot as any,
              eligibilityEvidence: evalResult.evidence,
              processedBy: 'AUTOMATIC_NO_SHOW_REFUND_WORKER',
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
  // Financial Overview & Reconciliation Balance (Admin Dashboard)
  // ---------------------------------------------------------------------------

  public static getFinancialOverview(environment: PaymentEnvironment = 'sandbox'): FinancialOverview {
    let totalVerifiedPayments = 0;
    let verifiedPaymentsCount = 0;

    for (const p of localStore.payments.values()) {
      if (p.environment === environment && p.status === 'SUCCESSFUL') {
        totalVerifiedPayments += Number(p.amount_ugx) || 0;
        verifiedPaymentsCount++;
      }
    }

    // Customer Wallet Liabilities: Sum of balances currently held for customers
    // This is strictly a LIABILITY of Mumwe Safaris, never platform income.
    let customerWalletLiabilities = 0;
    for (const u of localStore.users.values()) {
      const bal =
        environment === 'production'
          ? Number(u.wallet_balance_ugx) || 0
          : Number(u.sandbox_wallet_balance_ugx) || 0;
      if (bal > 0) {
        customerWalletLiabilities += bal;
      }
    }

    let platformCommissionEarned = 0;
    let beneficiaryEarningsPayable = 0;

    for (const e of localStore.platform_earnings.values()) {
      if (e.environment === environment && e.status === 'EARNED') {
        platformCommissionEarned += Number(e.platform_commission_ugx) || 0;
        beneficiaryEarningsPayable += Number(e.beneficiary_earnings_ugx) || 0;
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
        } else if (r.status === 'PENDING') {
          activeRefundRequests++;
        }
      }
    }

    // Reconciliation formula:
    // Total Payments Collected should reconcile with (Platform Earnings + Driver/Guide Earnings + Unspent Wallet Deposits - Refunds)
    const theoreticalOutgoings =
      platformCommissionEarned + beneficiaryEarningsPayable + customerWalletLiabilities - totalRefundsProcessed;
    const reconciliationDiff = totalVerifiedPayments - theoreticalOutgoings;

    return {
      environment,
      total_verified_payments_ugx: Math.round(totalVerifiedPayments),
      verified_payments_count: verifiedPaymentsCount,
      customer_wallet_liabilities_ugx: Math.round(customerWalletLiabilities),
      platform_commission_earned_ugx: Math.round(platformCommissionEarned),
      beneficiary_earnings_payable_ugx: Math.round(beneficiaryEarningsPayable),
      total_refunds_processed_ugx: Math.round(totalRefundsProcessed),
      refunds_processed_count: refundsProcessedCount,
      active_refund_requests_count: activeRefundRequests,
      reconciliation_difference_ugx: Math.round(reconciliationDiff),
      as_of: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Financial Adjustments (Admin Audit)
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

    const roundedAmount = Math.round(Number(amountUgx));
    if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
      throw new FinancialError('INVALID_AMOUNT', 'Adjustment amount must be a positive integer in UGX.', 400);
    }

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

    await db.persistFinancialAdjustment(adj);

    if (targetType === 'USER_WALLET') {
      if (adjustmentType === 'CREDIT') {
        await this.creditWallet({
          userId: targetId,
          amountUgx: roundedAmount,
          type: 'ADMIN_ADJUSTMENT',
          referenceType: 'ADMIN_ADJUSTMENT',
          referenceId: adj.id,
          environment,
          description: `Admin adjustment (+${roundedAmount} UGX): ${reason}`,
          metadata: { adminId, adjustmentId: adj.id },
        });
      } else {
        await this.debitWallet({
          userId: targetId,
          amountUgx: roundedAmount,
          referenceType: 'ADMIN_ADJUSTMENT',
          referenceId: adj.id,
          environment,
          description: `Admin adjustment (-${roundedAmount} UGX): ${reason}`,
          metadata: { adminId, adjustmentId: adj.id },
        });
      }
    }

    return adj;
  }
}
