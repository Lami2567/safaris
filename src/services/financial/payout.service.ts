import { v4 as uuidv4 } from 'uuid';
import { db, localStore } from '../../config/database';
import { ENV } from '../../config/env';
import { LedgerEnvironment, LedgerService, toExactUgxBigInt, withOrderedLocks } from './ledger.service';

export type PayoutStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'PROCESSING'
  | 'UNCERTAIN_TIMEOUT'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'MANUAL_DISBURSEMENT_REQUIRED';

export interface PayoutDestinationRecord {
  id: string;
  user_id: string;
  beneficiary_role: 'driver' | 'tour_guide';
  channel: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'BANK_TRANSFER';
  account_number: string;
  account_name: string;
  bank_name?: string;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PayoutRequestRecord {
  id: string;
  payout_reference: string;
  user_id: string;
  beneficiary_role: 'driver' | 'tour_guide';
  destination_id: string;
  amount_ugx: number;
  fee_ugx: number;
  net_amount_ugx: number;
  currency: string;
  status: PayoutStatus;
  idempotency_key?: string;
  hold_ledger_tx_id?: string;
  settlement_ledger_tx_id?: string;
  provider_name: string;
  provider_tx_ref?: string;
  approved_by?: string;
  approved_at?: string;
  failure_reason?: string;
  environment: LedgerEnvironment;
  audit_trail: Array<{ at: string; event: string; actor: string; note?: string }>;
  created_at: string;
  updated_at: string;
}

export interface PayoutProviderSubmitResult {
  outcome: 'COMPLETED' | 'PENDING' | 'FAILED' | 'TIMEOUT_UNKNOWN' | 'PROVIDER_DISABLED';
  providerName: string;
  providerTxRef?: string;
  responseCode?: string;
  message: string;
}

export interface PayoutProviderAdapter {
  readonly providerName: string;
  isEnabled(): boolean;
  submitPayout(params: {
    payoutReference: string;
    amountUgx: number;
    currency: string;
    channel: string;
    accountNumber: string;
    accountName: string;
  }): Promise<PayoutProviderSubmitResult>;
  verifyPayoutStatus(payoutReference: string, providerTxRef?: string): Promise<PayoutProviderSubmitResult>;
}

/**
 * Default Fail-Closed Payout Provider Adapter.
 * DPO Pay merchant collection does not automatically provide third-party mobile money disbursements.
 * Leaves live execution disabled until an approved licensed disbursement provider is configured and enabled.
 */
class DisabledPendingProviderAdapter implements PayoutProviderAdapter {
  public readonly providerName = 'DISABLED_PENDING_LICENSED_PROVIDER';

  public isEnabled(): boolean {
    return ENV.PAYOUTS_ENABLED;
  }

  public async submitPayout(_params: {
    payoutReference: string;
    amountUgx: number;
    currency: string;
    channel: string;
    accountNumber: string;
    accountName: string;
  }): Promise<PayoutProviderSubmitResult> {
    return {
      outcome: 'PROVIDER_DISABLED',
      providerName: this.providerName,
      responseCode: 'PAYOUT_PROVIDER_NOT_ACTIVE',
      message:
        'Automated third-party payout execution is disabled (PAYOUTS_ENABLED=false). Funds are safely reserved in the ledger awaiting authorized disbursement.',
    };
  }

  public async verifyPayoutStatus(_payoutReference: string): Promise<PayoutProviderSubmitResult> {
    return {
      outcome: 'PROVIDER_DISABLED',
      providerName: this.providerName,
      responseCode: 'PAYOUT_PROVIDER_NOT_ACTIVE',
      message: 'Automated payout provider is disabled.',
    };
  }
}

export class PayoutError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
  }
}

const MIN_WITHDRAWAL_UGX = 5_000n;
const MAX_WITHDRAWAL_UGX = 10_000_000n;

export class PayoutService {
  private static providerAdapter: PayoutProviderAdapter = new DisabledPendingProviderAdapter();

  public static setProviderAdapterForTesting(adapter: PayoutProviderAdapter): void {
    this.providerAdapter = adapter;
  }

  public static resetProviderAdapter(): void {
    this.providerAdapter = new DisabledPendingProviderAdapter();
  }

  public static getPayableAccountCode(role: 'driver' | 'tour_guide'): string {
    return role === 'tour_guide' ? '2040_GUIDE_PAYABLE' : '2030_DRIVER_PAYABLE';
  }

  /**
   * Computes a driver or guide's authoritative available earnings, reserved withdrawal amount,
   * and completed payouts strictly from the double-entry ledger.
   */
  public static getBeneficiaryEarningsSummary(
    userId: string,
    role: 'driver' | 'tour_guide',
    environment: LedgerEnvironment = (ENV.DPO_ENVIRONMENT || 'sandbox') as LedgerEnvironment
  ): {
    userId: string;
    role: 'driver' | 'tour_guide';
    environment: LedgerEnvironment;
    availableEarningsUgx: number;
    reservedWithdrawalUgx: number;
    completedPayoutsUgx: number;
    pendingMilestoneEarningsUgx: number;
  } {
    const payableCode = this.getPayableAccountCode(role);
    const availableEarningsUgx = LedgerService.getAccountBalance(payableCode, userId, environment);
    const reservedWithdrawalUgx = LedgerService.getAccountBalance('2060_PAYOUT_RESERVE_LIABILITY', userId, environment);

    let completedPayoutsUgx = 0;
    for (const p of localStore.payout_requests.values()) {
      if (p.user_id === userId && p.environment === environment && p.status === 'COMPLETED') {
        completedPayoutsUgx += Number(p.amount_ugx || 0);
      }
    }

    let pendingMilestoneEarningsUgx = 0;
    for (const c of localStore.commission_records.values()) {
      if (c.beneficiary_id === userId && c.environment === environment && c.status === 'PENDING_MILESTONE') {
        pendingMilestoneEarningsUgx += Number(c.beneficiary_net_ugx || 0);
      }
    }

    return {
      userId,
      role,
      environment,
      availableEarningsUgx,
      reservedWithdrawalUgx,
      completedPayoutsUgx,
      pendingMilestoneEarningsUgx,
    };
  }

  public static async registerDestination(params: {
    userId: string;
    beneficiaryRole: 'driver' | 'tour_guide';
    channel: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'BANK_TRANSFER';
    accountNumber: string;
    accountName: string;
    bankName?: string;
  }): Promise<PayoutDestinationRecord> {
    if (!params.accountNumber || params.accountNumber.trim().length < 7) {
      throw new PayoutError('INVALID_DESTINATION', 'Valid mobile money or bank account number is required.');
    }
    const now = new Date().toISOString();
    const id = `pdest_${Date.now()}_${uuidv4().substring(0, 6)}`;
    const dest: PayoutDestinationRecord = {
      id,
      user_id: params.userId,
      beneficiary_role: params.beneficiaryRole,
      channel: params.channel,
      account_number: params.accountNumber.trim(),
      account_name: params.accountName.trim() || 'Beneficiary',
      bank_name: params.bankName,
      is_verified: true,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    localStore.payout_destinations.set(id, dest);
    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO payout_destinations (id, user_id, beneficiary_role, channel, account_number, account_name, bank_name, is_verified, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, $8, $8)`,
          [dest.id, dest.user_id, dest.beneficiary_role, dest.channel, dest.account_number, dest.account_name, dest.bank_name || null, dest.created_at]
        );
      } catch (_) {}
    }
    return dest;
  }

  /**
   * Atomically validates eligibility, checks available ledger earnings under lock,
   * reserves funds in `2060_PAYOUT_RESERVE_LIABILITY`, and creates a withdrawal request.
   */
  public static async requestWithdrawal(params: {
    userId: string;
    beneficiaryRole: 'driver' | 'tour_guide';
    amountUgx: number | bigint;
    destinationId?: string;
    channel?: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'BANK_TRANSFER';
    accountNumber?: string;
    accountName?: string;
    idempotencyKey?: string;
    environment?: LedgerEnvironment;
  }): Promise<PayoutRequestRecord> {
    const {
      userId,
      beneficiaryRole,
      idempotencyKey,
      environment = (ENV.DPO_ENVIRONMENT || 'sandbox') as LedgerEnvironment,
    } = params;

    const amountBig = toExactUgxBigInt(params.amountUgx);
    if (amountBig < MIN_WITHDRAWAL_UGX) {
      throw new PayoutError('BELOW_MIN_WITHDRAWAL', `Minimum withdrawal is UGX ${MIN_WITHDRAWAL_UGX.toString()}.`);
    }
    if (amountBig > MAX_WITHDRAWAL_UGX) {
      throw new PayoutError('ABOVE_MAX_WITHDRAWAL', `Maximum single withdrawal is UGX ${MAX_WITHDRAWAL_UGX.toString()}.`);
    }

    const user = localStore.users.get(userId);
    if (!user) {
      throw new PayoutError('USER_NOT_FOUND', `Beneficiary user ${userId} not found.`, 404);
    }

    if (beneficiaryRole === 'driver') {
      const drv = localStore.drivers.get(userId);
      if (drv && (!drv.is_approved || drv.approval_status !== 'APPROVED')) {
        throw new PayoutError('BENEFICIARY_NOT_APPROVED', 'Driver account must be approved before requesting withdrawals.', 403);
      }
    } else if (beneficiaryRole === 'tour_guide') {
      const gd = localStore.tour_guides.get(userId);
      if (gd && (!gd.is_approved || gd.approval_status !== 'APPROVED')) {
        throw new PayoutError('BENEFICIARY_NOT_APPROVED', 'Tour guide account must be approved before requesting withdrawals.', 403);
      }
    }

    const lockKeys = [
      `payout_user:${environment}:${userId}`,
      ...(idempotencyKey ? [`payout_idem:${idempotencyKey}`] : []),
    ];

    return withOrderedLocks(lockKeys, async () => {
      // 1. Idempotency check
      if (idempotencyKey) {
        for (const existing of localStore.payout_requests.values()) {
          if (existing.idempotency_key === idempotencyKey && existing.user_id === userId) {
            return existing as PayoutRequestRecord;
          }
        }
      }

      // 2. Prevent submitting a second withdrawal if an existing payout is in UNCERTAIN_TIMEOUT
      for (const existing of localStore.payout_requests.values()) {
        if (existing.user_id === userId && existing.environment === environment && existing.status === 'UNCERTAIN_TIMEOUT') {
          throw new PayoutError(
            'PAYOUT_OUTCOME_UNCERTAIN',
            `Previous withdrawal ${existing.payout_reference} has an uncertain provider outcome and must be reconciled before new withdrawals.`,
            409
          );
        }
      }

      // 3. Check authoritative available earnings in ledger
      const payableAccountCode = this.getPayableAccountCode(beneficiaryRole);
      const availableUgx = BigInt(LedgerService.getAccountBalance(payableAccountCode, userId, environment));

      if (availableUgx < amountBig) {
        throw new PayoutError(
          'INSUFFICIENT_AVAILABLE_EARNINGS',
          `Insufficient available earnings. Available: ${availableUgx.toString()} UGX, Requested: ${amountBig.toString()} UGX.`,
          400
        );
      }

      // 4. Resolve or create payout destination
      let destinationId = params.destinationId;
      if (!destinationId) {
        const dest = await this.registerDestination({
          userId,
          beneficiaryRole,
          channel: params.channel || 'MTN_MOMO',
          accountNumber: params.accountNumber || user.phone || '+256770000000',
          accountName: params.accountName || user.full_name || 'Beneficiary',
        });
        destinationId = dest.id;
      }

      const now = new Date().toISOString();
      const id = `pout_${Date.now()}_${uuidv4().substring(0, 8)}`;
      const payoutRef = `WD-${Date.now().toString(36).toUpperCase()}-${uuidv4().substring(0, 4).toUpperCase()}`;

      // 5. Atomically reserve the withdrawal amount in the double-entry ledger:
      // DEBIT Driver/Guide Payable -> CREDIT Payout Reserve Liability
      const holdTx = await LedgerService.postTransaction({
        eventId: `evt_payout_reserve_${id}`,
        idempotencyKey: idempotencyKey ? `ledger_hold_${idempotencyKey}` : `ledger_hold_${id}`,
        transactionType: 'WITHDRAWAL_RESERVATION',
        referenceType: 'PAYOUT',
        referenceId: id,
        environment,
        description: `Reserved ${amountBig.toString()} UGX for ${beneficiaryRole} withdrawal ${payoutRef}`,
        postedBy: userId,
        entries: [
          { accountCode: payableAccountCode, ownerId: userId, direction: 'DEBIT', amountUgx: amountBig },
          { accountCode: '2060_PAYOUT_RESERVE_LIABILITY', ownerId: userId, direction: 'CREDIT', amountUgx: amountBig },
        ],
      });

      const record: PayoutRequestRecord = {
        id,
        payout_reference: payoutRef,
        user_id: userId,
        beneficiary_role: beneficiaryRole,
        destination_id: destinationId,
        amount_ugx: Number(amountBig),
        fee_ugx: 0,
        net_amount_ugx: Number(amountBig),
        currency: 'UGX',
        status: 'REQUESTED',
        idempotency_key: idempotencyKey,
        hold_ledger_tx_id: holdTx.id,
        provider_name: this.providerAdapter.providerName,
        environment,
        audit_trail: [
          {
            at: now,
            event: 'withdrawal_requested_and_reserved',
            actor: userId,
            note: `Reserved ${amountBig.toString()} UGX in ledger (${holdTx.id})`,
          },
        ],
        created_at: now,
        updated_at: now,
      };

      localStore.payout_requests.set(id, record);
      await this.persistPayoutRequest(record);

      await LedgerService.recordAuditLog({
        actorId: userId,
        actorRole: beneficiaryRole,
        action: 'WITHDRAWAL_REQUESTED',
        entityType: 'PAYOUT_REQUEST',
        entityId: id,
        amountUgx: Number(amountBig),
        newState: { status: record.status, payoutReference: payoutRef },
        environment,
      });

      return record;
    });
  }

  /**
   * Executes or dispatches a withdrawal request through the configured PayoutProviderAdapter.
   * Never marks a withdrawal COMPLETED unless the provider authoritatively confirms completion.
   */
  public static async executePayout(
    payoutId: string,
    actorId = 'SYSTEM_PAYOUT_WORKER'
  ): Promise<PayoutRequestRecord> {
    const existing = localStore.payout_requests.get(payoutId) as PayoutRequestRecord | undefined;
    if (!existing) {
      throw new PayoutError('PAYOUT_NOT_FOUND', `Payout request ${payoutId} not found.`, 404);
    }

    return withOrderedLocks([`payout_user:${existing.environment}:${existing.user_id}`, `payout:${payoutId}`], async () => {
      if (existing.status === 'COMPLETED' || existing.status === 'FAILED' || existing.status === 'CANCELLED') {
        return existing;
      }

      // Never submit a second payout with a new reference while the original outcome is unknown
      if (existing.status === 'UNCERTAIN_TIMEOUT') {
        return this.reconcileUncertainPayout(payoutId, actorId);
      }

      const dest = localStore.payout_destinations.get(existing.destination_id) as PayoutDestinationRecord | undefined;

      if (!this.providerAdapter.isEnabled()) {
        existing.status = 'MANUAL_DISBURSEMENT_REQUIRED';
        existing.failure_reason =
          'Automated third-party payout provider is disabled (PAYOUTS_ENABLED=false). Funds remain safely reserved in ledger for authorized disbursement.';
        existing.audit_trail.push({
          at: new Date().toISOString(),
          event: 'provider_disabled_manual_hold',
          actor: actorId,
          note: existing.failure_reason,
        });
        existing.updated_at = new Date().toISOString();
        await this.persistPayoutRequest(existing);
        return existing;
      }

      existing.status = 'PROCESSING';
      existing.updated_at = new Date().toISOString();

      let result: PayoutProviderSubmitResult;
      try {
        result = await this.providerAdapter.submitPayout({
          payoutReference: existing.payout_reference,
          amountUgx: existing.net_amount_ugx,
          currency: existing.currency,
          channel: dest?.channel || 'MTN_MOMO',
          accountNumber: dest?.account_number || '',
          accountName: dest?.account_name || '',
        });
      } catch (err: any) {
        result = {
          outcome: 'TIMEOUT_UNKNOWN',
          providerName: this.providerAdapter.providerName,
          message: err?.message || 'Provider request timed out; outcome unknown.',
        };
      }

      return this.applyProviderOutcome(existing, result, actorId);
    });
  }

  public static async reconcileUncertainPayout(
    payoutId: string,
    actorId = 'RECONCILIATION_WORKER'
  ): Promise<PayoutRequestRecord> {
    const existing = localStore.payout_requests.get(payoutId) as PayoutRequestRecord | undefined;
    if (!existing) {
      throw new PayoutError('PAYOUT_NOT_FOUND', `Payout request ${payoutId} not found.`, 404);
    }
    if (existing.status !== 'UNCERTAIN_TIMEOUT' && existing.status !== 'PROCESSING') {
      return existing;
    }

    const verifyResult = await this.providerAdapter.verifyPayoutStatus(
      existing.payout_reference,
      existing.provider_tx_ref
    );
    return this.applyProviderOutcome(existing, verifyResult, actorId);
  }

  private static async applyProviderOutcome(
    payout: PayoutRequestRecord,
    result: PayoutProviderSubmitResult,
    actorId: string
  ): Promise<PayoutRequestRecord> {
    const now = new Date().toISOString();
    payout.provider_name = result.providerName;
    if (result.providerTxRef) {
      payout.provider_tx_ref = result.providerTxRef;
    }

    if (result.outcome === 'COMPLETED') {
      // Settle reserved withdrawal liability against Settlement Bank Account
      const settleTx = await LedgerService.postTransaction({
        eventId: `evt_payout_settled_${payout.id}`,
        idempotencyKey: `ledger_settle_${payout.id}`,
        transactionType: 'WITHDRAWAL_SETTLEMENT',
        referenceType: 'PAYOUT',
        referenceId: payout.id,
        environment: payout.environment,
        description: `Completed withdrawal ${payout.payout_reference} via ${result.providerName}`,
        postedBy: actorId,
        entries: [
          {
            accountCode: '2060_PAYOUT_RESERVE_LIABILITY',
            ownerId: payout.user_id,
            direction: 'DEBIT',
            amountUgx: payout.amount_ugx,
          },
          {
            accountCode: '1030_SETTLEMENT_BANK_ACCOUNT',
            ownerId: 'PLATFORM',
            direction: 'CREDIT',
            amountUgx: payout.amount_ugx,
          },
        ],
      });

      payout.status = 'COMPLETED';
      payout.settlement_ledger_tx_id = settleTx.id;
      payout.failure_reason = undefined;
      payout.audit_trail.push({
        at: now,
        event: 'payout_completed',
        actor: actorId,
        note: `Provider ref: ${result.providerTxRef || 'confirmed'}`,
      });
    } else if (result.outcome === 'FAILED') {
      // Reverse the reservation so the driver/guide's payable balance is restored!
      const payableAccountCode = this.getPayableAccountCode(payout.beneficiary_role);
      await LedgerService.postTransaction({
        eventId: `evt_payout_failed_rev_${payout.id}`,
        idempotencyKey: `ledger_fail_rev_${payout.id}`,
        transactionType: 'WITHDRAWAL_RESERVATION_REVERSAL',
        referenceType: 'PAYOUT',
        referenceId: payout.id,
        environment: payout.environment,
        description: `Reversed reserved funds for failed withdrawal ${payout.payout_reference}`,
        postedBy: actorId,
        entries: [
          {
            accountCode: '2060_PAYOUT_RESERVE_LIABILITY',
            ownerId: payout.user_id,
            direction: 'DEBIT',
            amountUgx: payout.amount_ugx,
          },
          {
            accountCode: payableAccountCode,
            ownerId: payout.user_id,
            direction: 'CREDIT',
            amountUgx: payout.amount_ugx,
          },
        ],
      });

      payout.status = 'FAILED';
      payout.failure_reason = result.message;
      payout.audit_trail.push({
        at: now,
        event: 'payout_failed_and_reservation_reversed',
        actor: actorId,
        note: result.message,
      });
    } else if (result.outcome === 'TIMEOUT_UNKNOWN') {
      payout.status = 'UNCERTAIN_TIMEOUT';
      payout.failure_reason = result.message;
      payout.audit_trail.push({
        at: now,
        event: 'payout_timeout_uncertain',
        actor: actorId,
        note: 'Outcome unknown; reservation held pending reconciliation.',
      });
    } else if (result.outcome === 'PROVIDER_DISABLED') {
      payout.status = 'MANUAL_DISBURSEMENT_REQUIRED';
      payout.failure_reason = result.message;
      payout.audit_trail.push({
        at: now,
        event: 'provider_disabled',
        actor: actorId,
        note: result.message,
      });
    }

    payout.updated_at = now;
    await this.persistPayoutRequest(payout);
    return payout;
  }

  public static getPayoutRequests(filters: {
    userId?: string;
    beneficiaryId?: string;
    environment?: LedgerEnvironment;
    status?: string;
  } = {}): PayoutRequestRecord[] {
    const uid = filters.userId || filters.beneficiaryId;
    return Array.from(localStore.payout_requests.values())
      .filter((p) => {
        if (uid && p.user_id !== uid) return false;
        if (filters.environment && p.environment !== filters.environment) return false;
        if (filters.status && p.status !== filters.status) return false;
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  private static async persistPayoutRequest(payout: PayoutRequestRecord): Promise<void> {
    localStore.payout_requests.set(payout.id, payout);
    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO payout_requests (
             id, payout_reference, user_id, beneficiary_role, destination_id,
             amount_ugx, fee_ugx, net_amount_ugx, currency, status,
             idempotency_key, ledger_transaction_id, provider_name, provider_tx_ref,
             approved_by, approved_at, failure_reason, environment, audit_trail, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, 'UGX', $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             ledger_transaction_id = EXCLUDED.ledger_transaction_id,
             provider_name = EXCLUDED.provider_name,
             provider_tx_ref = EXCLUDED.provider_tx_ref,
             approved_by = EXCLUDED.approved_by,
             approved_at = EXCLUDED.approved_at,
             failure_reason = EXCLUDED.failure_reason,
             audit_trail = EXCLUDED.audit_trail,
             updated_at = CURRENT_TIMESTAMP`,
          [
            payout.id,
            payout.payout_reference,
            payout.user_id,
            payout.beneficiary_role,
            payout.destination_id || null,
            payout.amount_ugx,
            payout.fee_ugx,
            payout.net_amount_ugx,
            payout.status,
            payout.idempotency_key || null,
            payout.settlement_ledger_tx_id || payout.hold_ledger_tx_id || null,
            payout.provider_name,
            payout.provider_tx_ref || null,
            payout.approved_by || null,
            payout.approved_at || null,
            payout.failure_reason || null,
            payout.environment,
            JSON.stringify(payout.audit_trail || []),
            payout.created_at,
          ]
        );
      } catch (_) {}
    }
  }
}
