import { v4 as uuidv4 } from 'uuid';
import { localStore, db } from '../../config/database';
import { NotificationService } from '../notification/notification.service';
import { DpoPayGateway, DpoCreateTokenParams, DpoVerifyTokenResult, maskPhone, normalizeMsisdnForDpo } from './dpo_gateway';
import { ENV } from '../../config/env';
import { FinancialService } from '../financial/financial.service';
import { broadcastPaymentStream } from '../../realtime/socket_server';

/**
 * Explicit payment lifecycle.
 * - INITIATED : DPO token created, customer has not yet completed payment.
 * - PENDING   : Customer action in progress / DPO reports not yet paid / bank or MNO pending.
 * - SUCCESSFUL: Confirmed ONLY by authoritative server-side DPO verifyToken (Result 000) with matching amount & currency.
 * - FAILED    : Declined, rejected, data mismatch, or token creation failed.
 * - CANCELLED : Customer cancelled (DPO 904 or BackURL with confirmed cancelToken).
 * - EXPIRED   : DPO payment time limit (PTL) exceeded (DPO 903).
 * - REFUNDED  : Refunded (manual/admin flow).
 * 'PROCESSING' is retained only for backwards compatibility with older records and is treated as PENDING.
 */
export type PaymentStatus =
  | 'INITIATED'
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED';

export type PaymentMethodType = 'CARD' | 'MTN_MOMO' | 'AIRTEL_MONEY' | 'CASH' | 'WALLET';
export type PaymentReferenceType = 'TRIP' | 'TOUR' | 'DELIVERY' | 'WALLET';
export type PaymentEnvironment = 'sandbox' | 'production';

const DPO_PAYABLE_METHODS: PaymentMethodType[] = ['CARD', 'MTN_MOMO', 'AIRTEL_MONEY'];
const OPEN_STATUSES: PaymentStatus[] = ['INITIATED', 'PENDING', 'PROCESSING'];
const TERMINAL_UNPAID_STATUSES: PaymentStatus[] = ['FAILED', 'CANCELLED', 'EXPIRED'];
const SUSPICIOUS_FRAUD_CODES = new Set(['002', '004', '006']);
const PAYMENT_TIME_LIMIT_HOURS = 5;
const WALLET_MIN_TOPUP_UGX = 1000;
const WALLET_MAX_TOPUP_UGX = 5_000_000;

export interface PaymentInitiationRequest {
  userId: string;
  referenceType: PaymentReferenceType;
  referenceId: string;
  amountUgx?: number; // Ignored for TRIP/TOUR/DELIVERY (backend is authoritative). Only used as the requested WALLET top-up amount.
  paymentMethod: PaymentMethodType;
  phone?: string;
  customerEmail?: string;
  customerName?: string;
  description?: string;
  redirectUrl?: string;
  backUrl?: string;
  idempotencyKey?: string;
  cardDetails?: {
    cardNumber: string;
    cardExpiry: string;
    cardCvv: string;
    cardHolderName?: string;
    saveCard?: boolean;
  };
}

export interface PaymentAuditEntry {
  at: string;
  event: string;
  from?: PaymentStatus;
  to?: PaymentStatus;
  source: 'customer' | 'callback' | 'redirect' | 'cancel_redirect' | 'push' | 'reconciler' | 'admin' | 'system';
  actor?: string;
  dpoResultCode?: string;
  note?: string;
}

export interface PaymentRecord {
  id: string;
  transaction_id: string; // Our unique per-attempt CompanyRef sent to DPO
  user_id: string;
  reference_type: PaymentReferenceType;
  reference_id: string;
  amount_ugx: number;
  currency: string;
  payment_method: PaymentMethodType;
  phone: string; // Masked; full MSISDN is never persisted
  idempotency_key?: string;
  attempt_number: number;
  service_type_id: string;
  support_ticket_ref: string;
  dpo_trans_token: string;
  dpo_trans_ref: string;
  dpo_approval_code?: string;
  payment_url: string;
  mobile_instructions?: string;
  status: PaymentStatus;
  environment: PaymentEnvironment;
  failure_reason?: string;
  dpo_result_code?: string;
  dpo_result_explanation?: string;
  requires_review?: boolean;
  review_reason?: string;
  duplicate_of_payment_id?: string;
  fulfilled_at?: string;
  callback_count: number;
  last_callback_at?: string;
  last_verified_at?: string;
  verified_at?: string;
  refund_status?: 'NONE' | 'PENDING' | 'REFUNDED';
  refunded_amount_ugx?: number;
  refund_id?: string;
  audit_trail: PaymentAuditEntry[];
  provider_metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export class PaymentError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
  }
}

export interface PaymentListFilters {
  search?: string;
  status?: string;
  environment?: string;
  method?: string;
  referenceType?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Per-payment in-process mutex: serialises verification so concurrent callbacks/polls cannot double-fulfil. */
const paymentLocks = new Map<string, Promise<unknown>>();
async function withPaymentLock<T>(paymentId: string, fn: () => Promise<T>): Promise<T> {
  const previous = paymentLocks.get(paymentId) || Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => (release = resolve));
  const chained = previous.then(() => current);
  paymentLocks.set(paymentId, chained);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (paymentLocks.get(paymentId) === chained) {
      paymentLocks.delete(paymentId);
    }
  }
}

/** Per-reference mutex: prevents two simultaneous initiation requests from creating parallel attempts for the same booking. */
const referenceLocks = new Map<string, Promise<unknown>>();
async function withReferenceLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = referenceLocks.get(key) || Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => (release = resolve));
  const chained = previous.then(() => current);
  referenceLocks.set(key, chained);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (referenceLocks.get(key) === chained) {
      referenceLocks.delete(key);
    }
  }
}

function normalizeStatus(status: PaymentStatus): PaymentStatus {
  return status === 'PROCESSING' ? 'PENDING' : status;
}

export class PaymentService {
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private static appendAudit(payment: PaymentRecord, entry: Omit<PaymentAuditEntry, 'at'>) {
    if (!Array.isArray(payment.audit_trail)) payment.audit_trail = [];
    payment.audit_trail.push({ at: new Date().toISOString(), ...entry });
    // Bound the audit history so a misbehaving callback source cannot grow records unbounded
    if (payment.audit_trail.length > 200) {
      payment.audit_trail = payment.audit_trail.slice(-200);
    }
  }

  private static transition(payment: PaymentRecord, to: PaymentStatus, source: PaymentAuditEntry['source'], extras: Partial<PaymentAuditEntry> = {}) {
    const from = payment.status;
    if (from === to) return;
    // A verified success can never be downgraded by a later ambiguous/negative response
    if (from === 'SUCCESSFUL' && to !== 'REFUNDED') {
      this.appendAudit(payment, { event: 'transition_blocked', from, to, source, note: 'SUCCESSFUL payments cannot regress.', ...extras });
      return;
    }
    payment.status = to;
    this.appendAudit(payment, { event: 'status_change', from, to, source, ...extras });
  }

  /** Normalises legacy/partial records so the rest of the service can rely on all fields existing. */
  private static hydrate(p: any): PaymentRecord {
    if (!p) return p;
    p.audit_trail = Array.isArray(p.audit_trail) ? p.audit_trail : [];
    p.provider_metadata = p.provider_metadata && typeof p.provider_metadata === 'object' ? p.provider_metadata : {};
    p.callback_count = Number(p.callback_count || 0);
    p.attempt_number = Number(p.attempt_number || 1);
    p.environment = p.environment === 'production' ? 'production' : 'sandbox';
    p.service_type_id = p.service_type_id || '';
    p.support_ticket_ref = p.support_ticket_ref || ENV.DPO_SUPPORT_TICKET_REF;
    p.refund_status = p.refund_status || 'NONE';
    p.refunded_amount_ugx = Number(p.refunded_amount_ugx || 0);
    return p as PaymentRecord;
  }

  private static async persist(payment: PaymentRecord) {
    payment.updated_at = new Date().toISOString();
    await db.persistPayment(payment);
    try {
      broadcastPaymentStream(payment);
    } catch (_) {}
  }

  /** Customer-facing message that clearly distinguishes pending from confirmed outcomes. */
  public static customerMessage(p: PaymentRecord): string {
    const status = normalizeStatus(p.status);
    switch (status) {
      case 'SUCCESSFUL':
        return 'Payment confirmed by DPO Pay. Your booking payment is complete.';
      case 'INITIATED':
        return p.payment_method === 'CARD'
          ? 'Payment started. Complete your card payment on the secure DPO Pay page, then return here to confirm.'
          : 'Payment started. Approve the Mobile Money prompt on your phone, then tap "Check payment status".';
      case 'PENDING':
        return 'Payment not yet confirmed. If you already paid, please wait a moment and check again — do not pay twice.';
      case 'CANCELLED':
        return 'Payment was cancelled. No money was collected. You can start a new payment.';
      case 'EXPIRED':
        return 'The payment session expired before it was completed. You can start a new payment.';
      case 'FAILED':
        return `Payment was not approved${p.failure_reason ? `: ${p.failure_reason}` : '.'} You can try again.`;
      case 'REFUNDED':
        return 'This payment has been refunded.';
      default:
        return 'Payment status unknown. Please check again shortly.';
    }
  }

  /** Public (customer-safe) view: omits internal audit trail, provider metadata and review flags. */
  public static toPublicView(p: PaymentRecord) {
    return {
      id: p.id,
      transaction_id: p.transaction_id,
      reference_type: p.reference_type,
      reference_id: p.reference_id,
      amount_ugx: p.amount_ugx,
      currency: p.currency,
      payment_method: p.payment_method,
      status: normalizeStatus(p.status),
      is_confirmed: p.status === 'SUCCESSFUL',
      is_final: !OPEN_STATUSES.includes(p.status),
      environment: p.environment,
      is_test_payment: p.environment === 'sandbox',
      payment_url: OPEN_STATUSES.includes(p.status) ? p.payment_url : '',
      mobile_instructions: OPEN_STATUSES.includes(p.status) ? p.mobile_instructions : undefined,
      failure_reason: p.failure_reason,
      customer_message: this.customerMessage(p),
      attempt_number: p.attempt_number,
      verified_at: p.verified_at,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  }

  private static async loadEntity(table: 'tour_bookings' | 'trips' | 'deliveries', id: string): Promise<any> {
    const store = (localStore as any)[table] as Map<string, any>;
    let entity = store.get(id);
    if (!entity && db.isPostgresConnected) {
      try {
        const res = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
        if (res?.rows?.length > 0) {
          entity = res.rows[0];
          store.set(id, entity);
        }
      } catch (_) {
        /* fall through to not-found */
      }
    }
    return entity;
  }

  /** A booking is "already paid" only in the environment that processed the payment. Sandbox payments never satisfy live bookings. */
  private static isPaidInEnvironment(entity: any, env: PaymentEnvironment): boolean {
    const paid = entity?.payment_status === 'PAID' || entity?.payment_status === 'COMPLETED';
    if (!paid) return false;
    const paidEnv = entity.payment_environment;
    // Legacy flags without an environment tag were never set by a DPO-verified payment (e.g. hardcoded 'PAID'), so they are not authoritative
    if (!paidEnv) return false;
    return paidEnv === env;
  }

  // ---------------------------------------------------------------------------
  // Amount, ownership & eligibility (authoritative server-side)
  // ---------------------------------------------------------------------------

  /**
   * Resolves and authoritatively validates the payable amount from trusted records and existing admin pricing.
   * Also enforces ownership and eligibility. Client-supplied amounts are ignored except for wallet top-ups.
   */
  public static async resolveAuthoritativeAmount(
    referenceType: PaymentReferenceType,
    referenceId: string,
    clientAmount?: number,
    userId?: string,
    env: PaymentEnvironment = DpoPayGateway.environment
  ): Promise<{ authoritativeAmount: number; serviceDetails: string }> {
    let authoritativeAmount = 0;
    let serviceDetails = '';

    if (referenceType === 'TOUR') {
      const booking = await this.loadEntity('tour_bookings', referenceId);
      if (!booking) throw new PaymentError('NOT_FOUND', `Tour booking #${referenceId} not found.`, 404);
      if (userId && booking.customer_id && booking.customer_id !== userId) {
        throw new PaymentError('FORBIDDEN', 'You can only pay for your own bookings.', 403);
      }
      const bStatus = String(booking.booking_status || booking.status || '').toUpperCase();
      if (['CANCELLED', 'REJECTED', 'COMPLETED'].includes(bStatus)) {
        throw new PaymentError('NOT_ELIGIBLE', `Tour booking #${referenceId} is ${bStatus} and cannot be paid.`, 409);
      }
      if (this.isPaidInEnvironment(booking, env)) {
        throw new PaymentError('ALREADY_PAID', `Tour booking #${referenceId} has already been paid.`, 409);
      }
      authoritativeAmount = Math.round(Number(booking.total_ugx ?? booking.totalUgx ?? 0));
      serviceDetails = `Tour Booking #${referenceId} (${booking.travel_date || booking.start_date || 'Safari'})`;
    } else if (referenceType === 'TRIP') {
      const trip = await this.loadEntity('trips', referenceId);
      if (!trip) throw new PaymentError('NOT_FOUND', `Trip #${referenceId} not found.`, 404);
      if (userId && trip.customer_id && trip.customer_id !== userId) {
        throw new PaymentError('FORBIDDEN', 'You can only pay for your own trips.', 403);
      }
      const tStatus = String(trip.status || '').toUpperCase();
      if (['CANCELLED', 'REJECTED', 'NO_DRIVERS'].includes(tStatus)) {
        throw new PaymentError('NOT_ELIGIBLE', `Trip #${referenceId} is ${tStatus} and cannot be paid.`, 409);
      }
      if (this.isPaidInEnvironment(trip, env)) {
        throw new PaymentError('ALREADY_PAID', `Trip #${referenceId} has already been paid.`, 409);
      }
      authoritativeAmount = Math.round(Number(trip.fare_ugx ?? trip.fare ?? 0)) + Math.round(Number(trip.tip_ugx ?? 0));
      serviceDetails = `Ride #${referenceId} (${trip.pickup_title || 'Pickup'} to ${trip.dest_title || 'Destination'})`;
    } else if (referenceType === 'DELIVERY') {
      const delivery = await this.loadEntity('deliveries', referenceId);
      if (!delivery) throw new PaymentError('NOT_FOUND', `Delivery #${referenceId} not found.`, 404);
      const ownerId = delivery.sender_id || delivery.customer_id;
      if (userId && ownerId && ownerId !== userId) {
        throw new PaymentError('FORBIDDEN', 'You can only pay for your own deliveries.', 403);
      }
      const dStatus = String(delivery.status || '').toUpperCase();
      if (['CANCELLED', 'REJECTED'].includes(dStatus)) {
        throw new PaymentError('NOT_ELIGIBLE', `Delivery #${referenceId} is ${dStatus} and cannot be paid.`, 409);
      }
      if (this.isPaidInEnvironment(delivery, env)) {
        throw new PaymentError('ALREADY_PAID', `Delivery #${referenceId} has already been paid.`, 409);
      }
      authoritativeAmount = Math.round(Number(delivery.price_ugx ?? delivery.fare_ugx ?? 0));
      serviceDetails = `Package Delivery #${referenceId} (${delivery.tracking_number || ''})`;
    } else if (referenceType === 'WALLET') {
      const requested = Math.round(Number(clientAmount || 0));
      if (!requested || requested < WALLET_MIN_TOPUP_UGX) {
        throw new PaymentError('INVALID_AMOUNT', `Minimum wallet top-up amount is UGX ${WALLET_MIN_TOPUP_UGX.toLocaleString()}.`);
      }
      if (requested > WALLET_MAX_TOPUP_UGX) {
        throw new PaymentError('INVALID_AMOUNT', `Maximum wallet top-up amount is UGX ${WALLET_MAX_TOPUP_UGX.toLocaleString()}.`);
      }
      if (userId && referenceId !== userId) {
        throw new PaymentError('FORBIDDEN', 'You can only top up your own wallet.', 403);
      }
      authoritativeAmount = requested;
      serviceDetails = `Wallet Top-Up: UGX ${authoritativeAmount.toLocaleString()}`;
    } else {
      throw new PaymentError('INVALID_REFERENCE', `Unsupported payment reference type "${referenceType}".`);
    }

    if (!Number.isFinite(authoritativeAmount) || authoritativeAmount <= 0) {
      throw new PaymentError('INVALID_AMOUNT', `Invalid payable amount for ${referenceType} #${referenceId}.`);
    }

    return { authoritativeAmount, serviceDetails };
  }

  // ---------------------------------------------------------------------------
  // Initiation
  // ---------------------------------------------------------------------------

  /**
   * Initiates (or safely resumes) a DPO payment attempt for an eligible booking.
   * - Fails closed if the active DPO environment is not fully configured (no cross-environment fallback).
   * - Idempotent per idempotency key; reconciles ambiguous open attempts with DPO before creating a new one.
   */
  public static async processPayment(req: PaymentInitiationRequest): Promise<PaymentRecord> {
    if (!req.userId) throw new PaymentError('UNAUTHENTICATED', 'Authentication required.', 401);
    if (!req.referenceType || !req.referenceId) {
      throw new PaymentError('INVALID_REQUEST', 'referenceType and referenceId are required.');
    }
    if (!DPO_PAYABLE_METHODS.includes(req.paymentMethod) && req.paymentMethod !== 'WALLET' && req.paymentMethod !== 'CASH') {
      throw new PaymentError('UNSUPPORTED_METHOD', 'Supported payment methods: CARD, MTN_MOMO, AIRTEL_MONEY via DPO Pay, Safaris WALLET, or CASH.');
    }

    if (req.paymentMethod === 'CASH') {
      if (req.referenceType === 'WALLET') {
        throw new PaymentError('INVALID_REQUEST', 'Cannot top up wallet using cash.');
      }
      const env = DpoPayGateway.environment;
      const { authoritativeAmount, serviceDetails } = await this.resolveAuthoritativeAmount(
        req.referenceType,
        req.referenceId,
        req.amountUgx,
        req.userId,
        env
      );

      const paymentId = `pay_${Date.now()}_${uuidv4().substring(0, 8)}`;
      const txId = `CSH-${Date.now().toString().slice(-6)}-${uuidv4().substring(0, 4).toUpperCase()}`;
      const now = new Date().toISOString();
      const payment: PaymentRecord = {
        id: paymentId,
        transaction_id: txId,
        user_id: req.userId,
        reference_type: req.referenceType,
        reference_id: req.referenceId,
        amount_ugx: authoritativeAmount,
        currency: 'UGX',
        payment_method: 'CASH',
        phone: req.phone || '',
        idempotency_key: req.idempotencyKey,
        attempt_number: 1,
        service_type_id: 'CASH',
        support_ticket_ref: 'CASH',
        dpo_trans_token: `cash_${paymentId}`,
        dpo_trans_ref: txId,
        payment_url: '',
        status: 'PENDING',
        environment: env,
        callback_count: 0,
        refund_status: 'NONE',
        refunded_amount_ugx: 0,
        audit_trail: [
          {
            at: now,
            event: 'cash_payment_selected',
            source: 'customer',
            note: 'Cash payment selected upon trip/delivery completion',
          },
        ],
        provider_metadata: { method: 'CASH', serviceDetails },
        created_at: now,
        updated_at: now,
      };

      await this.persist(payment);
      return payment;
    }

    if (req.paymentMethod === 'WALLET') {
      if (req.referenceType === 'WALLET') {
        throw new PaymentError('INVALID_REQUEST', 'Cannot top up wallet using wallet balance.');
      }
      const env = DpoPayGateway.environment;
      const { authoritativeAmount, serviceDetails } = await this.resolveAuthoritativeAmount(
        req.referenceType,
        req.referenceId,
        req.amountUgx,
        req.userId,
        env
      );

      const paymentId = `pay_${Date.now()}_${uuidv4().substring(0, 8)}`;
      const txId = `WLT-${Date.now().toString().slice(-6)}-${uuidv4().substring(0, 4).toUpperCase()}`;

      // Debit wallet atomically
      await FinancialService.debitWallet({
        userId: req.userId,
        amountUgx: authoritativeAmount,
        referenceType: req.referenceType,
        referenceId: req.referenceId,
        environment: env,
        idempotencyKey: req.idempotencyKey,
        description: `Wallet payment for ${req.referenceType} #${req.referenceId}`,
      });

      const now = new Date().toISOString();
      const payment: PaymentRecord = {
        id: paymentId,
        transaction_id: txId,
        user_id: req.userId,
        reference_type: req.referenceType,
        reference_id: req.referenceId,
        amount_ugx: authoritativeAmount,
        currency: 'UGX',
        payment_method: 'WALLET',
        phone: req.phone || '',
        idempotency_key: req.idempotencyKey,
        attempt_number: 1,
        service_type_id: 'WALLET',
        support_ticket_ref: 'WALLET',
        dpo_trans_token: `wallet_${paymentId}`,
        dpo_trans_ref: txId,
        payment_url: '',
        status: 'SUCCESSFUL',
        environment: env,
        callback_count: 0,
        verified_at: now,
        refund_status: 'NONE',
        refunded_amount_ugx: 0,
        audit_trail: [
          {
            at: now,
            event: 'wallet_payment_completed',
            source: 'customer',
            note: 'Paid using Safaris Wallet balance',
          },
        ],
        provider_metadata: { method: 'WALLET', serviceDetails },
        created_at: now,
        updated_at: now,
      };

      await this.fulfil(payment);
      await this.persist(payment);
      this.notifySuccess(payment);
      return payment;
    }

    const config = ENV.validateDpoConfig();
    if (!config.isValid) {
      console.error(`[PaymentService] DPO configuration invalid for ${config.environment.toUpperCase()}: ${config.errors.join(' | ')}`);
      throw new PaymentError(
        'PAYMENT_CONFIG_ERROR',
        'Online payments are temporarily unavailable. Please try again later or contact support.',
        503
      );
    }
    const env = config.environment;

    // Mobile Money requires a valid MSISDN before we create any DPO token
    let msisdn = '';
    if (req.paymentMethod === 'MTN_MOMO' || req.paymentMethod === 'AIRTEL_MONEY') {
      const phoneCheck = normalizeMsisdnForDpo(req.phone || '');
      if (!phoneCheck.valid) throw new PaymentError('INVALID_PHONE', phoneCheck.error || 'Invalid phone number.');
      msisdn = phoneCheck.msisdn;
    }

    const lockKey = `${req.referenceType}:${req.referenceId}`;
    return withReferenceLock(lockKey, async () => {
      // 1. Idempotency key replay → return the same attempt
      if (req.idempotencyKey) {
        for (const raw of localStore.payments.values()) {
          const p = this.hydrate(raw);
          if (p.idempotency_key === req.idempotencyKey && p.user_id === req.userId) {
            if (p.reference_type !== req.referenceType || p.reference_id !== req.referenceId) {
              throw new PaymentError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different payment.', 409);
            }
            return p;
          }
        }
      }

      // 2. Authoritative amount, ownership & eligibility
      const { authoritativeAmount, serviceDetails } = await this.resolveAuthoritativeAmount(
        req.referenceType,
        req.referenceId,
        req.amountUgx,
        req.userId,
        env
      );

      // 3. Examine previous attempts for this reference in this environment
      const previous = this.getPaymentsForReference(req.referenceType, req.referenceId).filter((p) => p.environment === env);
      if (req.referenceType !== 'WALLET') {
        const paid = previous.find((p) => p.status === 'SUCCESSFUL');
        if (paid) return paid;
      }

      for (const open of previous.filter((p) => OPEN_STATUSES.includes(p.status))) {
        // Reconcile ambiguous attempts with DPO before allowing another one (never assume failure)
        let reconciled = open;
        try {
          reconciled = await this.verifyPayment(open.id, { source: 'system', actor: req.userId });
        } catch (err: any) {
          console.warn(`[PaymentService] Could not reconcile open attempt ${open.id}: ${err.message}`);
        }
        if (reconciled.status === 'SUCCESSFUL' && req.referenceType !== 'WALLET') return reconciled;
        if (OPEN_STATUSES.includes(reconciled.status)) {
          const sameAmount = Math.round(reconciled.amount_ugx) === authoritativeAmount;
          const sameMethod = reconciled.payment_method === req.paymentMethod;
          if (sameAmount && sameMethod && reconciled.payment_url) {
            // Safe resume of the existing DPO session
            return reconciled;
          }
          // Different method/amount: retire the open DPO token first so the customer cannot pay twice
          const cancelled = await DpoPayGateway.cancelToken(reconciled.dpo_trans_token);
          if (!cancelled.success) {
            throw new PaymentError(
              'PAYMENT_IN_PROGRESS',
              'A previous payment for this booking is still being processed. Please complete it or wait for it to expire before trying another method.',
              409
            );
          }
          await withPaymentLock(reconciled.id, async () => {
            this.transition(reconciled, 'CANCELLED', 'system', { note: 'Superseded by a new payment attempt (DPO cancelToken confirmed).' });
            reconciled.failure_reason = 'Superseded by a new payment attempt.';
            await this.persist(reconciled);
          });
        }
      }

      // 4. Create a new uniquely-referenced attempt
      const attemptNumber = previous.length + 1;
      const paymentId = `pay_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
      const shortRef = req.referenceId.replace(/[^A-Za-z0-9]/g, '').slice(-10).toUpperCase();
      const txRef = `MS-${req.referenceType.charAt(0)}${shortRef}-A${attemptNumber}-${Date.now().toString(36).toUpperCase()}`;
      const description = (req.description || `Mumwe Safaris: ${serviceDetails}`).slice(0, 250);
      const now = new Date().toISOString();

      const record: PaymentRecord = {
        id: paymentId,
        transaction_id: txRef,
        user_id: req.userId,
        reference_type: req.referenceType,
        reference_id: req.referenceId,
        amount_ugx: authoritativeAmount,
        currency: 'UGX',
        payment_method: req.paymentMethod,
        phone: msisdn ? maskPhone(msisdn) : '',
        idempotency_key: req.idempotencyKey,
        attempt_number: attemptNumber,
        service_type_id: config.serviceTypeId,
        support_ticket_ref: config.supportTicketRef,
        dpo_trans_token: '',
        dpo_trans_ref: '',
        payment_url: '',
        status: 'INITIATED',
        environment: env,
        callback_count: 0,
        audit_trail: [],
        provider_metadata: {},
        created_at: now,
        updated_at: now,
      };
      this.appendAudit(record, { event: 'attempt_created', to: 'INITIATED', source: 'customer', actor: req.userId, note: `Attempt #${attemptNumber} (${env.toUpperCase()})` });

      const dpoParams: DpoCreateTokenParams = {
        amountUgx: authoritativeAmount,
        currency: 'UGX',
        referenceId: txRef,
        description,
        customerName: req.customerName,
        customerEmail: req.customerEmail,
        customerPhone: msisdn || undefined,
        redirectUrl: req.redirectUrl,
        backUrl: req.backUrl,
        paymentMethod: req.paymentMethod,
        ptlHours: PAYMENT_TIME_LIMIT_HOURS,
        companyRefUnique: true,
      };

      let dpoResult;
      try {
        dpoResult = await DpoPayGateway.createToken(dpoParams);
      } catch (err: any) {
        // Network failure: no token was obtained, so no money can have been collected on this attempt
        this.transition(record, 'FAILED', 'system', { note: 'createToken network error' });
        record.failure_reason = 'Could not reach DPO Pay. Please try again.';
        await this.persist(record);
        throw new PaymentError('GATEWAY_UNAVAILABLE', record.failure_reason, 502);
      }

      record.dpo_result_code = dpoResult.resultCode;
      record.dpo_result_explanation = dpoResult.resultExplanation;

      if (!dpoResult.success) {
        this.transition(record, 'FAILED', 'system', { dpoResultCode: dpoResult.resultCode, note: 'createToken rejected' });
        record.failure_reason = `DPO rejected the payment request (${dpoResult.resultCode}).`;
        await this.persist(record);
        console.warn(`[PaymentService] createToken rejected for ${txRef}: ${dpoResult.resultCode} ${dpoResult.resultExplanation}`);
        throw new PaymentError('PAYMENT_REJECTED', 'The payment could not be started. Please try again or use another method.', 502);
      }

      record.dpo_trans_token = dpoResult.transToken;
      record.dpo_trans_ref = dpoResult.transRef || '';
      record.payment_url = dpoResult.paymentUrl;
      this.appendAudit(record, { event: 'dpo_token_created', source: 'system', dpoResultCode: dpoResult.resultCode });

      // 5. Mobile Money: request the MNO prompt. The hosted page remains a valid fallback.
      if (msisdn) {
        const mobile = await DpoPayGateway.chargeTokenMobile({
          transToken: dpoResult.transToken,
          phoneNumber: msisdn,
          mno: req.paymentMethod,
        });
        record.mobile_instructions = mobile.instructions || undefined;
        record.provider_metadata = {
          ...record.provider_metadata,
          mobile: {
            statusCode: mobile.statusCode,
            explanation: mobile.resultExplanation,
            mno: mobile.mnoUsed,
            country: mobile.mnoCountryUsed,
            redirectOption: mobile.redirectOption,
            pushAccepted: mobile.success,
          },
        };
        this.appendAudit(record, {
          event: mobile.success ? 'mobile_push_requested' : 'mobile_push_unavailable',
          source: 'system',
          dpoResultCode: mobile.statusCode,
          note: mobile.success ? 'MNO prompt requested via ChargeTokenMobile' : 'Use DPO hosted page to complete Mobile Money',
        });
        if (mobile.success) {
          this.transition(record, 'PENDING', 'system', { note: 'Awaiting customer approval on phone' });
        }
      }

      // 5b. Direct Card Processing: charge credit/debit card if cardDetails provided
      if (req.paymentMethod === 'CARD' && req.cardDetails) {
        const cardRes = await DpoPayGateway.chargeTokenCreditCard({
          transToken: dpoResult.transToken,
          cardNumber: req.cardDetails.cardNumber,
          cardExpiry: req.cardDetails.cardExpiry,
          cardCvv: req.cardDetails.cardCvv,
          cardHolderName: req.cardDetails.cardHolderName || req.customerName,
        });

        record.dpo_approval_code = cardRes.approvalCode;
        record.provider_metadata = {
          ...record.provider_metadata,
          card: {
            statusCode: cardRes.statusCode,
            explanation: cardRes.resultExplanation,
            cardLast4: cardRes.cardLast4,
            cardType: cardRes.cardType,
            approved: cardRes.transactionApproved,
          },
        };

        if (cardRes.transactionApproved) {
          record.dpo_result_code = '000';
          record.dpo_result_explanation = cardRes.resultExplanation;
          record.verified_at = new Date().toISOString();
          this.transition(record, 'SUCCESSFUL', 'system', {
            note: `Direct card charge approved: ${cardRes.cardType} ending in ${cardRes.cardLast4}`,
            dpoResultCode: '000',
          });
          await this.fulfil(record);
          this.notifySuccess(record);

          // Save card if requested
          if (req.cardDetails.saveCard && req.userId) {
            await this.saveUserMaskedCard(req.userId, {
              brand: cardRes.cardType || 'Card',
              last4: cardRes.cardLast4 || '0000',
              expiry: req.cardDetails.cardExpiry,
              holderName: req.cardDetails.cardHolderName || req.customerName || 'Cardholder',
            });
          }
        } else {
          record.failure_reason = cardRes.resultExplanation;
          this.appendAudit(record, {
            event: 'card_charge_pending_or_failed',
            source: 'system',
            dpoResultCode: cardRes.statusCode,
            note: cardRes.resultExplanation,
          });
        }
      }

      await this.persist(record);
      return record;
    });
  }

  // ---------------------------------------------------------------------------
  // Verification (authoritative)
  // ---------------------------------------------------------------------------

  /**
   * Server-side verification via DPO verifyToken. A frontend redirect or callback payload is NEVER proof of payment.
   * Serialised per payment so duplicate callbacks / polls cannot double-fulfil.
   */
  public static async verifyPayment(
    paymentId: string,
    opts: { source?: PaymentAuditEntry['source']; actor?: string; requesterUserId?: string; isAdmin?: boolean } = {}
  ): Promise<PaymentRecord> {
    const existing = localStore.payments.get(paymentId);
    if (!existing) throw new PaymentError('NOT_FOUND', `Payment ${paymentId} not found.`, 404);
    const initial = this.hydrate(existing);
    if (opts.requesterUserId && !opts.isAdmin && initial.user_id !== opts.requesterUserId) {
      throw new PaymentError('FORBIDDEN', 'You do not have access to this payment.', 403);
    }

    return withPaymentLock(paymentId, async () => {
      const payment = this.hydrate(localStore.payments.get(paymentId));
      const source = opts.source || 'customer';

      // Already verified successful → idempotent no-op
      if (payment.status === 'SUCCESSFUL' || payment.status === 'REFUNDED') return payment;

      if (!payment.dpo_trans_token) {
        // createToken never succeeded; nothing to verify at DPO
        return payment;
      }

      // Never verify a transaction with the other environment's credentials
      const activeEnv = DpoPayGateway.environment;
      if (payment.environment !== activeEnv) {
        this.appendAudit(payment, {
          event: 'verification_skipped',
          source,
          actor: opts.actor,
          note: `Payment belongs to ${payment.environment.toUpperCase()} but server is running ${activeEnv.toUpperCase()}. Cross-environment verification is not permitted.`,
        });
        await this.persist(payment);
        return payment;
      }

      let result: DpoVerifyTokenResult;
      try {
        result = await DpoPayGateway.verifyToken(payment.dpo_trans_token, payment.transaction_id);
      } catch (err: any) {
        // Network timeout: outcome unknown — keep current status, record and retry later
        this.appendAudit(payment, { event: 'verification_error', source, actor: opts.actor, note: 'DPO unreachable; status left unchanged for reconciliation.' });
        await this.persist(payment);
        return payment;
      }

      const now = new Date().toISOString();
      payment.last_verified_at = now;
      payment.dpo_result_code = result.resultCode;
      payment.dpo_result_explanation = result.resultExplanation;
      payment.provider_metadata = {
        ...payment.provider_metadata,
        lastVerify: {
          at: now,
          resultCode: result.resultCode,
          explanation: result.resultExplanation,
          amount: result.transAmount,
          currency: result.transCurrency,
          approval: result.transactionApproval,
          cardType: result.customerCreditType,
          cardLast4: result.customerCreditLast4,
          fraudAlert: result.fraudAlert,
          fraudExplanation: result.fraudExplanation,
          mobilePaymentRequest: result.mobilePaymentRequest,
          settlementDate: result.settlementDate,
          environment: result.environment,
        },
      };

      // Configuration problems (801/802/803/804) are not payment outcomes
      if (['801', '802', '803', '804'].includes(result.resultCode)) {
        this.appendAudit(payment, { event: 'verification_config_error', source, dpoResultCode: result.resultCode, note: 'DPO configuration error; status unchanged.' });
        console.error(`[PaymentService] verifyToken configuration error ${result.resultCode} for payment ${payment.id}`);
        await this.persist(payment);
        return payment;
      }

      let target = result.lifecycleStatus as PaymentStatus;

      if (target === 'SUCCESSFUL') {
        const expectedAmount = Math.round(Number(payment.amount_ugx));
        const paidAmount = result.transAmount !== undefined ? Math.round(Number(result.transAmount)) : NaN;
        const paidCurrency = (result.transCurrency || '').toUpperCase();
        const amountOk = Number.isFinite(paidAmount) && paidAmount === expectedAmount;
        // DPO may return a converted currency if the customer used DCC; only accept the booking currency
        const currencyOk = !paidCurrency || paidCurrency === payment.currency.toUpperCase();

        if (!amountOk || !currencyOk) {
          target = 'PENDING';
          payment.requires_review = true;
          payment.review_reason = `DPO reported ${result.transAmount ?? '?'} ${paidCurrency || '?'} but expected ${expectedAmount} ${payment.currency}.`;
          this.appendAudit(payment, { event: 'amount_mismatch', source, dpoResultCode: result.resultCode, note: payment.review_reason });
        } else if (result.fraudAlert && SUSPICIOUS_FRAUD_CODES.has(result.fraudAlert)) {
          target = 'PENDING';
          payment.requires_review = true;
          payment.review_reason = `DPO fraud alert ${result.fraudAlert}${result.fraudExplanation ? ` (${result.fraudExplanation})` : ''}.`;
          this.appendAudit(payment, { event: 'fraud_hold', source, dpoResultCode: result.resultCode, note: payment.review_reason });
        }
      } else if (result.resultCode === '002') {
        payment.requires_review = true;
        payment.review_reason = 'DPO reported overpaid/underpaid transaction (002).';
      }

      if (target === 'SUCCESSFUL') {
        this.transition(payment, 'SUCCESSFUL', source, { actor: opts.actor, dpoResultCode: result.resultCode, note: 'Verified by DPO verifyToken' });
        payment.verified_at = now;
        payment.dpo_approval_code = result.transactionApproval;
        payment.failure_reason = undefined;
        await this.fulfil(payment);
        await this.persist(payment);
        this.notifySuccess(payment);
        return payment;
      }

      // Only move to a terminal unpaid state on an explicit DPO answer
      if (target === 'PENDING') {
        if (payment.status === 'INITIATED' && result.resultCode !== '900') {
          this.transition(payment, 'PENDING', source, { dpoResultCode: result.resultCode });
        } else if (TERMINAL_UNPAID_STATUSES.includes(payment.status) && result.resultCode !== '900') {
          // DPO is authoritative: a previously-failed attempt that DPO now reports as pending/authorised is reopened
          this.transition(payment, 'PENDING', source, { dpoResultCode: result.resultCode, note: 'Reopened by DPO status' });
        } else {
          this.appendAudit(payment, { event: 'verified_unpaid', source, dpoResultCode: result.resultCode });
        }
      } else {
        const before = payment.status;
        this.transition(payment, target, source, { actor: opts.actor, dpoResultCode: result.resultCode });
        if (target === 'CANCELLED') payment.failure_reason = 'Payment was cancelled.';
        else if (target === 'EXPIRED') payment.failure_reason = 'Payment time limit expired.';
        else if (target === 'FAILED') payment.failure_reason = result.resultExplanation || 'Payment was declined.';
        if (before !== target && OPEN_STATUSES.includes(before)) this.notifyFailure(payment);
      }

      await this.persist(payment);
      return payment;
    });
  }

  // ---------------------------------------------------------------------------
  // Callbacks / redirects
  // ---------------------------------------------------------------------------

  public static findPaymentByDpoReference(transToken?: string, companyRef?: string): PaymentRecord | null {
    for (const raw of localStore.payments.values()) {
      if (transToken && raw.dpo_trans_token && raw.dpo_trans_token === transToken) return this.hydrate(raw);
    }
    if (companyRef) {
      for (const raw of localStore.payments.values()) {
        if (raw.transaction_id === companyRef) return this.hydrate(raw);
      }
    }
    return null;
  }

  private static async findPaymentWithDbFallback(transToken?: string, companyRef?: string): Promise<PaymentRecord | null> {
    const found = this.findPaymentByDpoReference(transToken, companyRef);
    if (found || !db.isPostgresConnected) return found;
    try {
      const res = await db.query('SELECT id FROM payments WHERE dpo_trans_token = $1 OR reference = $2 LIMIT 1', [transToken || '', companyRef || '']);
      if (res?.rows?.length > 0) {
        const p = localStore.payments.get(res.rows[0].id);
        return p ? this.hydrate(p) : null;
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  /**
   * Handles DPO RedirectURL returns and pushPayments notifications.
   * The payload is used ONLY to locate the payment; status is decided by server-side verifyToken.
   */
  public static async handleDpoCallback(
    transToken: string | undefined,
    source: 'redirect' | 'push' | 'callback' = 'callback',
    companyRef?: string
  ): Promise<PaymentRecord | null> {
    const payment = await this.findPaymentWithDbFallback(transToken, companyRef);
    if (!payment) {
      console.warn(`[PaymentService] DPO ${source} did not match any known payment (ref=${companyRef || 'n/a'}).`);
      return null;
    }

    await withPaymentLock(payment.id, async () => {
      const p = this.hydrate(localStore.payments.get(payment.id));
      p.callback_count = (p.callback_count || 0) + 1;
      p.last_callback_at = new Date().toISOString();
      this.appendAudit(p, {
        event: p.callback_count > 1 ? 'duplicate_callback_received' : 'callback_received',
        source,
        note: `Callback #${p.callback_count}`,
      });
      await this.persist(p);
    });

    return this.verifyPayment(payment.id, { source });
  }

  /**
   * Handles DPO BackURL (customer pressed "back/cancel" on the hosted page).
   * We verify first; if DPO confirms not paid, we cancel the token at DPO so the session cannot be paid later.
   */
  public static async handleDpoCancel(transToken: string | undefined, companyRef?: string): Promise<PaymentRecord | null> {
    const payment = await this.findPaymentWithDbFallback(transToken, companyRef);
    if (!payment) return null;

    const verified = await this.verifyPayment(payment.id, { source: 'cancel_redirect' });
    if (!OPEN_STATUSES.includes(verified.status)) return verified;

    return withPaymentLock(payment.id, async () => {
      const p = this.hydrate(localStore.payments.get(payment.id));
      if (!OPEN_STATUSES.includes(p.status)) return p;
      const cancel = await DpoPayGateway.cancelToken(p.dpo_trans_token);
      if (cancel.success) {
        this.transition(p, 'CANCELLED', 'cancel_redirect', { dpoResultCode: cancel.resultCode, note: 'Customer returned via BackURL; DPO token cancelled.' });
        p.failure_reason = 'Payment was cancelled.';
        this.notifyFailure(p);
      } else {
        // Could not confirm cancellation at DPO: remain PENDING and let the reconciler decide
        this.appendAudit(p, { event: 'cancel_unconfirmed', source: 'cancel_redirect', dpoResultCode: cancel.resultCode, note: 'Left pending for reconciliation.' });
      }
      await this.persist(p);
      return p;
    });
  }

  // ---------------------------------------------------------------------------
  // Reconciliation
  // ---------------------------------------------------------------------------

  /**
   * Re-checks open (INITIATED/PENDING) transactions with DPO. Safe to run repeatedly.
   * Only payments belonging to the currently active environment are checked.
   */
  public static async reconcileOpenPayments(options: { minAgeMs?: number; limit?: number } = {}): Promise<{ checked: number; updated: number; errors: number }> {
    const minAge = options.minAgeMs ?? 2 * 60 * 1000;
    const limit = options.limit ?? 50;
    const env = DpoPayGateway.environment;
    if (!ENV.validateDpoConfig().isValid) return { checked: 0, updated: 0, errors: 0 };

    const candidates = Array.from(localStore.payments.values())
      .map((p) => this.hydrate(p))
      .filter((p) => OPEN_STATUSES.includes(p.status) && p.environment === env && p.dpo_trans_token)
      .filter((p) => Date.now() - new Date(p.updated_at || p.created_at).getTime() >= minAge)
      .slice(0, limit);

    let updated = 0;
    let errors = 0;
    for (const p of candidates) {
      const before = p.status;
      try {
        const after = await this.verifyPayment(p.id, { source: 'reconciler' });
        if (after.status !== before) updated++;
      } catch (err: any) {
        errors++;
        console.warn(`[PaymentService] Reconciliation error for ${p.id}: ${err.message}`);
      }
    }
    if (candidates.length > 0) {
      console.log(`[PaymentService] Reconciliation (${env.toUpperCase()}): checked=${candidates.length} updated=${updated} errors=${errors}`);
    }
    return { checked: candidates.length, updated, errors };
  }

  private static reconcilerTimer: NodeJS.Timeout | null = null;
  public static startReconciler(intervalMs = Number(process.env.DPO_RECONCILE_INTERVAL_MS || 5 * 60 * 1000)) {
    if (this.reconcilerTimer || intervalMs <= 0) return;
    this.reconcilerTimer = setInterval(() => {
      this.reconcileOpenPayments().catch((err) => console.warn('[PaymentService] Reconciler error:', err.message));
    }, intervalMs);
    this.reconcilerTimer.unref?.();
  }

  public static stopReconciler() {
    if (this.reconcilerTimer) clearInterval(this.reconcilerTimer);
    this.reconcilerTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Fulfilment (runs exactly once per verified payment)
  // ---------------------------------------------------------------------------

  private static async fulfil(payment: PaymentRecord): Promise<void> {
    if (payment.fulfilled_at) {
      this.appendAudit(payment, { event: 'fulfilment_skipped', source: 'system', note: 'Already fulfilled.' });
      return;
    }

    const { reference_type, reference_id, user_id, amount_ugx, payment_method, environment } = payment;
    const now = new Date().toISOString();

    // Detect a second successful payment for the same booking in the same environment (customer paid twice)
    if (reference_type !== 'WALLET') {
      const other = this.getPaymentsForReference(reference_type, reference_id).find(
        (p) => p.id !== payment.id && p.status === 'SUCCESSFUL' && p.environment === environment && p.fulfilled_at
      );
      if (other) {
        payment.duplicate_of_payment_id = other.id;
        payment.requires_review = true;
        payment.review_reason = `Duplicate successful payment; booking already paid by ${other.id}. Refund review required.`;
        payment.fulfilled_at = now;
        this.appendAudit(payment, { event: 'duplicate_payment_detected', source: 'system', note: payment.review_reason });
        return;
      }
    }

    if (reference_type === 'TOUR') {
      const booking = localStore.tour_bookings.get(reference_id);
      if (booking) {
        booking.payment_status = 'PAID';
        booking.payment_environment = environment;
        booking.payment_method = payment_method;
        // Existing business rule: a booking awaiting payment becomes CONFIRMED once paid. Guide assignment is untouched.
        const current = String(booking.booking_status || booking.status || '').toUpperCase();
        if (current === 'PENDING_PAYMENT' || current === 'PENDING' || !current) {
          booking.booking_status = 'CONFIRMED';
          booking.status = 'CONFIRMED';
        }
        booking.updated_at = now;
        await db.persistTourBooking(booking);
        await this.updatePaymentEnvironmentColumn('tour_bookings', reference_id, environment);
      }
    } else if (reference_type === 'TRIP') {
      const trip = localStore.trips.get(reference_id);
      if (trip) {
        trip.payment_status = 'PAID';
        trip.payment_environment = environment;
        trip.updated_at = now;
        await db.persistTrip(trip);
        if (db.isPostgresConnected) {
          try {
            await db.query(`UPDATE trips SET payment_status = 'PAID', payment_environment = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [environment, reference_id]);
          } catch (_) {}
        }
      }
    } else if (reference_type === 'DELIVERY') {
      const delivery = localStore.deliveries.get(reference_id);
      if (delivery) {
        // Payment status only — courier assignment/delivery status is managed by the dispatch flow
        delivery.payment_status = 'PAID';
        delivery.payment_environment = environment;
        delivery.updated_at = now;
        localStore.deliveries.set(reference_id, delivery);
        if (db.isPostgresConnected) {
          try {
            await db.query(`UPDATE deliveries SET payment_status = 'PAID', payment_environment = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [environment, reference_id]);
          } catch (_) {}
        }
        db.saveAllToDisk();
      }
    } else if (reference_type === 'WALLET') {
      try {
        await FinancialService.creditWallet({
          userId: user_id,
          amountUgx: amount_ugx,
          type: 'DEPOSIT',
          referenceType: 'DEPOSIT',
          referenceId: payment.id,
          paymentId: payment.id,
          environment,
          idempotencyKey: payment.idempotency_key,
          description: `Wallet top-up of ${amount_ugx} UGX via ${payment_method} (${environment.toUpperCase()})`,
          metadata: { dpo_trans_token: payment.dpo_trans_token, dpo_trans_ref: payment.dpo_trans_ref },
        });
      } catch (err: any) {
        console.error('[PaymentService] Failed to credit wallet via FinancialService:', err);
      }
    }

    // Record platform earnings & commission ledger for paid services
    if (reference_type === 'TRIP' || reference_type === 'TOUR' || reference_type === 'DELIVERY') {
      try {
        let beneficiaryId: string | undefined = undefined;
        let commissionRate = 15.0; // 15% standard
        if (reference_type === 'TRIP') {
          const t = localStore.trips.get(reference_id);
          beneficiaryId = t?.driver_id;
        } else if (reference_type === 'TOUR') {
          const b = localStore.tour_bookings.get(reference_id);
          beneficiaryId = b?.guide_id || b?.tour_guide_id;
          commissionRate = 20.0; // 20% for tour bookings
        } else if (reference_type === 'DELIVERY') {
          const d = localStore.deliveries.get(reference_id);
          beneficiaryId = d?.courier_id;
        }

        await FinancialService.recordPlatformEarning({
          bookingType: reference_type as any,
          bookingId: reference_id,
          paymentId: payment.id,
          payerUserId: user_id,
          beneficiaryId,
          grossAmountUgx: amount_ugx,
          commissionRate,
          paymentMethod: payment_method,
          environment,
          metadata: { transaction_id: payment.transaction_id },
        });
      } catch (err: any) {
        console.warn('[PaymentService] Failed to record platform earning:', err);
      }
    }

    payment.fulfilled_at = now;
    this.appendAudit(payment, { event: 'fulfilled', source: 'system', note: `${reference_type} #${reference_id} marked paid (${environment.toUpperCase()})` });
  }

  private static async updatePaymentEnvironmentColumn(table: string, id: string, env: PaymentEnvironment) {
    if (!db.isPostgresConnected) return;
    const allowedTables = ['trips', 'deliveries', 'tour_bookings'];
    if (!allowedTables.includes(table)) {
      console.warn(`[PaymentService] Blocked invalid table name in updatePaymentEnvironmentColumn: ${table}`);
      return;
    }
    try {
      await db.query(`UPDATE ${table} SET payment_environment = $1 WHERE id = $2`, [env, id]);
    } catch (_) {}
  }

  public static async saveUserMaskedCard(
    userId: string,
    card: { brand: string; last4: string; expiry: string; holderName: string }
  ) {
    const user = localStore.users.get(userId);
    if (!user) return null;
    const cards = Array.isArray(user.saved_cards) ? [...user.saved_cards] : [];
    const exists = cards.some((c: any) => c.last4 === card.last4 && c.brand.toLowerCase() === card.brand.toLowerCase());
    if (!exists) {
      const newCard = {
        id: `card_${Date.now()}_${uuidv4().substring(0, 6)}`,
        brand: card.brand,
        last4: card.last4,
        expiry: card.expiry,
        holderName: card.holderName,
        createdAt: new Date().toISOString(),
      };
      cards.push(newCard);
      user.saved_cards = cards;
      await db.persistUser(user);
      return newCard;
    }
    return null;
  }

  public static getUserMaskedCards(userId: string) {
    const user = localStore.users.get(userId);
    return Array.isArray(user?.saved_cards) ? user.saved_cards : [];
  }

  public static async deleteUserMaskedCard(userId: string, cardId: string) {
    const user = localStore.users.get(userId);
    if (!user || !Array.isArray(user.saved_cards)) return false;
    user.saved_cards = user.saved_cards.filter((c: any) => c.id !== cardId);
    await db.persistUser(user);
    return true;
  }

  private static methodLabel(method: PaymentMethodType) {
    return method === 'CARD' ? 'Card via DPO Pay' : method === 'MTN_MOMO' ? 'MTN Mobile Money' : method === 'AIRTEL_MONEY' ? 'Airtel Money' : method;
  }

  private static notifySuccess(payment: PaymentRecord) {
    if (payment.duplicate_of_payment_id) return;
    const testTag = payment.environment === 'sandbox' ? '[TEST] ' : '';
    NotificationService.createNotification({
      userId: payment.user_id,
      title: `${testTag}Payment Confirmed`,
      message: `${testTag}Payment of UGX ${payment.amount_ugx.toLocaleString()} confirmed via ${this.methodLabel(payment.payment_method)} for ${payment.reference_type.toLowerCase()} #${payment.reference_id}.`,
      type: 'PAYMENT',
      metadata: {
        paymentId: payment.id,
        transactionId: payment.transaction_id,
        referenceType: payment.reference_type,
        referenceId: payment.reference_id,
        amountUgx: payment.amount_ugx,
        status: 'SUCCESSFUL',
        environment: payment.environment,
      },
    }).catch((err) => console.error('[Payment Notification Error]', err?.message));
  }

  private static notifyFailure(payment: PaymentRecord) {
    const testTag = payment.environment === 'sandbox' ? '[TEST] ' : '';
    NotificationService.createNotification({
      userId: payment.user_id,
      title: `${testTag}Payment Not Completed`,
      message: `${testTag}${this.customerMessage(payment)}`,
      type: 'PAYMENT',
      metadata: {
        paymentId: payment.id,
        referenceType: payment.reference_type,
        referenceId: payment.reference_id,
        status: payment.status,
        environment: payment.environment,
      },
    }).catch((err) => console.error('[Payment Failure Notification Error]', err?.message));
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  public static getPaymentById(paymentId: string): PaymentRecord | undefined {
    const p = localStore.payments.get(paymentId);
    return p ? this.hydrate(p) : undefined;
  }

  public static getPaymentsForReference(referenceType: PaymentReferenceType, referenceId: string): PaymentRecord[] {
    return Array.from(localStore.payments.values())
      .map((p) => this.hydrate(p))
      .filter((p) => p.reference_type === referenceType && p.reference_id === referenceId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  /** Latest attempt for a reference (successful attempt preferred). */
  public static getPaymentByReference(referenceType: PaymentReferenceType, referenceId: string): PaymentRecord | undefined {
    const all = this.getPaymentsForReference(referenceType, referenceId);
    return all.find((p) => p.status === 'SUCCESSFUL') || all[all.length - 1];
  }

  public static getPaymentHistory(userId: string): PaymentRecord[] {
    return Array.from(localStore.payments.values())
      .map((p) => this.hydrate(p))
      .filter((p) => p.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /** Admin: filterable list of payment attempts. */
  public static listPayments(filters: PaymentListFilters = {}) {
    const search = (filters.search || '').trim().toLowerCase();
    const fromTs = filters.from ? new Date(filters.from).getTime() : NaN;
    const toTs = filters.to ? new Date(filters.to).getTime() + 24 * 60 * 60 * 1000 - 1 : NaN;

    let rows = Array.from(localStore.payments.values()).map((p) => this.hydrate(p));
    if (filters.environment) rows = rows.filter((p) => p.environment === (filters.environment === 'live' ? 'production' : filters.environment));
    if (filters.status) rows = rows.filter((p) => normalizeStatus(p.status) === filters.status!.toUpperCase());
    if (filters.method) rows = rows.filter((p) => p.payment_method === filters.method!.toUpperCase());
    if (filters.referenceType) rows = rows.filter((p) => p.reference_type === filters.referenceType!.toUpperCase());
    if (!Number.isNaN(fromTs)) rows = rows.filter((p) => new Date(p.created_at).getTime() >= fromTs);
    if (!Number.isNaN(toTs)) rows = rows.filter((p) => new Date(p.created_at).getTime() <= toTs);
    if (search) {
      rows = rows.filter((p) =>
        [p.id, p.transaction_id, p.reference_id, p.dpo_trans_ref, p.user_id, p.dpo_approval_code]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(search))
      );
    }
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const total = rows.length;
    const offset = Math.max(0, Number(filters.offset || 0));
    const limit = Math.min(500, Math.max(1, Number(filters.limit || 100)));
    return {
      total,
      items: rows.slice(offset, offset + limit).map((p) => ({
        ...p,
        status: normalizeStatus(p.status),
        dpo_trans_token: p.dpo_trans_token ? `${p.dpo_trans_token.slice(0, 8)}…` : '',
        payment_url: undefined,
        customer_message: this.customerMessage(p),
      })),
    };
  }

  /** Admin: totals kept strictly separate per environment. Only SUCCESSFUL production payments count as collected revenue. */
  public static getPaymentStats() {
    const emptyBucket = () => ({
      count: 0,
      successfulCount: 0,
      collectedUgx: 0,
      pendingCount: 0,
      pendingUgx: 0,
      failedCount: 0,
      cancelledCount: 0,
      expiredCount: 0,
      requiresReviewCount: 0,
    });
    const buckets: Record<PaymentEnvironment, ReturnType<typeof emptyBucket>> = {
      sandbox: emptyBucket(),
      production: emptyBucket(),
    };
    for (const raw of localStore.payments.values()) {
      const p = this.hydrate(raw);
      const b = buckets[p.environment];
      const st = normalizeStatus(p.status);
      b.count++;
      if (p.requires_review) b.requiresReviewCount++;
      if (st === 'SUCCESSFUL' && !p.duplicate_of_payment_id) {
        b.successfulCount++;
        b.collectedUgx += Number(p.amount_ugx) || 0;
      } else if (st === 'INITIATED' || st === 'PENDING') {
        b.pendingCount++;
        b.pendingUgx += Number(p.amount_ugx) || 0;
      } else if (st === 'FAILED') b.failedCount++;
      else if (st === 'CANCELLED') b.cancelledCount++;
      else if (st === 'EXPIRED') b.expiredCount++;
    }
    return {
      activeEnvironment: DpoPayGateway.environment,
      live: buckets.production,
      sandbox: buckets.sandbox,
      note: 'Sandbox totals are test transactions and are never counted as collected revenue.',
    };
  }

  /** Admin: sanitized configuration/activation status (never returns tokens). */
  public static getConfigStatus() {
    const v = ENV.validateDpoConfig();
    const live = ENV.validateDpoConfig('production');
    return {
      activeEnvironment: v.environment,
      isValid: v.isValid,
      errors: v.errors,
      serviceTypeId: v.serviceTypeId,
      supportTicketRef: v.supportTicketRef,
      apiBaseUrl: v.apiBaseUrl,
      payUrl: v.payUrl,
      callbackUrl: v.callbackUrl,
      cancelUrl: v.cancelUrl,
      sandbox: {
        ready: v.sandboxReady,
        companyTokenConfigured: Boolean(ENV.DPO_SANDBOX_COMPANY_TOKEN),
        serviceTypeId: ENV.DPO_SANDBOX_SERVICE_TYPE_ID,
      },
      live: {
        ready: live.isValid,
        companyTokenConfigured: Boolean(ENV.DPO_LIVE_COMPANY_TOKEN),
        serviceTypeIdConfigured: Boolean(ENV.DPO_LIVE_SERVICE_TYPE_ID),
        activationConfirmed: ENV.DPO_LIVE_ACTIVATION_CONFIRMED,
        checklist: live.checklist,
        blockingIssues: live.errors,
      },
      pendingFromDpo: v.pendingFromDpo,
      switchProcedure:
        'The environment is controlled only by server-side configuration (DPO_ENVIRONMENT). Live mode is refused by the backend until every checklist item passes. See docs/DPO-PAYMENT-TESTING.md.',
    };
  }
}
