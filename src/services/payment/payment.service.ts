import { v4 as uuidv4 } from 'uuid';
import { localStore, db } from '../../config/database';
import { NotificationService } from '../notification/notification.service';
import { DpoPayGateway, DpoCreateTokenParams, DpoVerifyTokenResult } from './dpo_gateway';

export type PaymentStatus =
  | 'PENDING'
  | 'INITIATED'
  | 'PROCESSING'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export type PaymentMethodType = 'CARD' | 'MTN_MOMO' | 'AIRTEL_MONEY' | 'CASH' | 'WALLET';
export type PaymentReferenceType = 'TRIP' | 'TOUR' | 'DELIVERY' | 'WALLET';

export interface PaymentInitiationRequest {
  userId: string;
  referenceType: PaymentReferenceType;
  referenceId: string;
  amountUgx: number;
  paymentMethod: PaymentMethodType;
  phone?: string;
  customerEmail?: string;
  customerName?: string;
  description?: string;
  redirectUrl?: string;
  backUrl?: string;
}

export interface PaymentRecord {
  id: string;
  transaction_id: string;
  user_id: string;
  reference_type: PaymentReferenceType;
  reference_id: string;
  amount_ugx: number;
  currency: string;
  payment_method: PaymentMethodType;
  phone: string;
  dpo_trans_token: string;
  dpo_trans_ref: string;
  payment_url: string;
  status: PaymentStatus;
  failure_reason?: string;
  verified_at?: string;
  created_at: string;
  updated_at: string;
}

export class PaymentService {
  /**
   * Initializes a new payment attempt via DPO Pay for Cards or Mobile Money.
   * Creates a persistent payment transaction record.
   *
   * Note: Sensitive card numbers, CVVs, or PINs are NEVER captured or stored on SAFARIS servers.
   */
  public static async processPayment(req: PaymentInitiationRequest): Promise<PaymentRecord> {
    const paymentId = `pay_${uuidv4().substring(0, 8)}`;
    const txRef = `SAFARIS_${req.referenceType}_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    const description = req.description ||
      `SAFARIS Uganda: ${req.referenceType} Booking #${req.referenceId}`;

    // 1. Call official DPO Pay XML Gateway
    const dpoParams: DpoCreateTokenParams = {
      amountUgx: req.amountUgx,
      currency: 'UGX',
      referenceId: txRef,
      description,
      customerName: req.customerName,
      customerEmail: req.customerEmail,
      customerPhone: req.phone,
      redirectUrl: req.redirectUrl,
      backUrl: req.backUrl,
    };

    const dpoResult = await DpoPayGateway.createToken(dpoParams);

    const now = new Date().toISOString();
    const record: PaymentRecord = {
      id: paymentId,
      transaction_id: txRef,
      user_id: req.userId,
      reference_type: req.referenceType,
      reference_id: req.referenceId,
      amount_ugx: req.amountUgx,
      currency: 'UGX',
      payment_method: req.paymentMethod,
      phone: req.phone || '',
      dpo_trans_token: dpoResult.transToken,
      dpo_trans_ref: dpoResult.transRef || txRef,
      payment_url: dpoResult.paymentUrl,
      status: dpoResult.success ? 'INITIATED' : 'FAILED',
      failure_reason: dpoResult.success ? undefined : dpoResult.resultExplanation,
      created_at: now,
      updated_at: now,
    };

    // Store in-memory store
    localStore.payments.set(paymentId, record);

    // Persist to PostgreSQL if connected
    if (db.isPostgresConnected) {
      try {
        await db.query(`
          INSERT INTO payments (
            id, user_id, trip_id, delivery_id, booking_id, amount_ugx,
            currency, payment_method, reference, status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status
        `, [
          paymentId,
          req.userId,
          req.referenceType === 'TRIP' ? req.referenceId : null,
          req.referenceType === 'DELIVERY' ? req.referenceId : null,
          req.referenceType === 'TOUR' ? req.referenceId : null,
          req.amountUgx,
          'UGX',
          req.paymentMethod,
          txRef,
          record.status === 'SUCCESSFUL' ? 'COMPLETED' : (record.status === 'FAILED' ? 'FAILED' : 'PENDING'),
        ]);
      } catch (err) {
        console.warn('[PaymentService] PostgreSQL insert notice:', err);
      }
    }

    return record;
  }

  /**
   * Server-side payment verification via DPO Pay verifyToken API.
   * Does NOT trust client-side claims alone.
   */
  public static async verifyPayment(paymentId: string): Promise<PaymentRecord> {
    const payment = localStore.payments.get(paymentId);
    if (!payment) {
      throw new Error(`Payment transaction ${paymentId} not found.`);
    }

    // If already marked successful, return verified record
    if (payment.status === 'SUCCESSFUL') {
      return payment;
    }

    // Call DPO Pay verification endpoint
    const verifyResult: DpoVerifyTokenResult = await DpoPayGateway.verifyToken(payment.dpo_trans_token);

    const now = new Date().toISOString();
    payment.updated_at = now;

    if (verifyResult.transactionApproved) {
      payment.status = 'SUCCESSFUL';
      payment.verified_at = now;
      payment.failure_reason = undefined;

      // Update linked entity based on reference type
      await this.onPaymentSuccess(payment);
    } else {
      if (verifyResult.resultCode === '901') {
        payment.status = 'PROCESSING';
      } else if (verifyResult.resultCode === '902') {
        payment.status = 'CANCELLED';
        payment.failure_reason = 'Payment was cancelled by the customer.';
      } else {
        payment.status = 'FAILED';
        payment.failure_reason = verifyResult.resultExplanation || 'Payment transaction was declined.';
      }

      await this.onPaymentFailure(payment);
    }

    localStore.payments.set(paymentId, payment);

    // Update in PostgreSQL
    if (db.isPostgresConnected) {
      try {
        const sqlStatus = payment.status === 'SUCCESSFUL' ? 'COMPLETED' : (payment.status === 'FAILED' ? 'FAILED' : 'PENDING');
        await db.query('UPDATE payments SET status = $1 WHERE id = $2', [sqlStatus, paymentId]);
      } catch (err) {
        console.warn('[PaymentService] PostgreSQL update error:', err);
      }
    }

    return payment;
  }

  /**
   * Handles DPO callback/webhook redirection with TransactionToken
   */
  public static async handleDpoCallback(transToken: string): Promise<PaymentRecord | null> {
    // Find payment record matching transaction token
    let targetPayment: PaymentRecord | null = null;
    for (const p of localStore.payments.values()) {
      if (p.dpo_trans_token === transToken) {
        targetPayment = p;
        break;
      }
    }

    if (!targetPayment) {
      console.warn(`[PaymentService] DPO callback token ${transToken} does not match any local payment.`);
      return null;
    }

    return await this.verifyPayment(targetPayment.id);
  }

  /**
   * Actions executed on confirmed successful payment
   */
  private static async onPaymentSuccess(payment: PaymentRecord): Promise<void> {
    const { reference_type, reference_id, user_id, amount_ugx, payment_method } = payment;

    // 1. TOUR BOOKING: Confirm booking and mark paid
    if (reference_type === 'TOUR') {
      const booking = localStore.tour_bookings.get(reference_id);
      if (booking) {
        booking.payment_status = 'PAID';
        booking.booking_status = 'CONFIRMED';
        booking.updated_at = new Date().toISOString();
        localStore.tour_bookings.set(reference_id, booking);

        if (db.isPostgresConnected) {
          try {
            await db.query(`
              UPDATE tour_bookings 
              SET payment_status = 'COMPLETED', status = 'CONFIRMED' 
              WHERE id = $1
            `, [reference_id]);
          } catch (_) {}
        }
      }
    }

    // 2. RIDE TRIP: Mark trip paid
    if (reference_type === 'TRIP') {
      const trip = localStore.trips.get(reference_id);
      if (trip) {
        trip.payment_status = 'PAID';
        trip.updated_at = new Date().toISOString();
        localStore.trips.set(reference_id, trip);
      }
    }

    // 3. WALLET TOP-UP: Credit user wallet balance
    if (reference_type === 'WALLET') {
      const user = localStore.users.get(user_id);
      if (user) {
        user.wallet_balance_ugx = (Number(user.wallet_balance_ugx) || 0) + Number(amount_ugx);
        localStore.users.set(user_id, user);

        if (db.isPostgresConnected) {
          try {
            await db.query('UPDATE users SET wallet_balance_ugx = wallet_balance_ugx + $1 WHERE id = $2', [amount_ugx, user_id]);
          } catch (_) {}
        }
      }
    }

    // 4. Send persistent push/in-app notification to the customer
    const methodLabel = payment_method === 'CARD'
      ? 'Credit/Debit Card via DPO Pay'
      : payment_method === 'MTN_MOMO'
      ? 'MTN Mobile Money'
      : payment_method === 'AIRTEL_MONEY'
      ? 'Airtel Money'
      : payment_method;

    NotificationService.createNotification({
      userId: user_id,
      title: 'Payment Successful',
      message: `Payment of UGX ${amount_ugx.toLocaleString()} confirmed via ${methodLabel} for ${(reference_type || 'service').toLowerCase()} #${reference_id}.`,
      type: 'PAYMENT',
      metadata: {
        paymentId: payment.id,
        transactionId: payment.transaction_id,
        referenceType: reference_type,
        referenceId: reference_id,
        amountUgx: amount_ugx,
        status: 'SUCCESSFUL',
      },
    }).catch((err) => console.error('[Payment Notification Error]', err));
  }

  /**
   * Actions executed on failed or declined payment
   */
  private static async onPaymentFailure(payment: PaymentRecord): Promise<void> {
    const { reference_type, reference_id, user_id, amount_ugx, failure_reason } = payment;

    // Send failure notification to customer informing them of retry possibility
    NotificationService.createNotification({
      userId: user_id,
      title: 'Payment Incomplete',
      message: `Your payment of UGX ${amount_ugx.toLocaleString()} for ${(reference_type || 'service').toLowerCase()} #${reference_id} could not be completed (${failure_reason || 'Declined'}). You can retry anytime.`,
      type: 'PAYMENT',
      metadata: {
        paymentId: payment.id,
        referenceType: reference_type,
        referenceId: reference_id,
        status: payment.status,
        failureReason: failure_reason,
      },
    }).catch((err) => console.error('[Payment Failure Notification Error]', err));
  }

  public static getPaymentById(paymentId: string): PaymentRecord | undefined {
    return localStore.payments.get(paymentId);
  }

  public static getPaymentByReference(referenceType: PaymentReferenceType, referenceId: string): PaymentRecord | undefined {
    for (const p of localStore.payments.values()) {
      if (p.reference_type === referenceType && p.reference_id === referenceId) {
        return p;
      }
    }
    return undefined;
  }

  public static getPaymentHistory(userId: string): PaymentRecord[] {
    return Array.from(localStore.payments.values())
      .filter((p: PaymentRecord) => p.user_id === userId)
      .reverse();
  }
}
