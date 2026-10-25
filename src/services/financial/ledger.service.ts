import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, localStore } from '../../config/database';
import { ENV } from '../../config/env';

export type AccountType = 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE' | 'EQUITY';
export type EntryDirection = 'DEBIT' | 'CREDIT';
export type LedgerEnvironment = 'sandbox' | 'production';

export interface LedgerAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  normal_balance: EntryDirection;
  currency: string;
  owner_type: string;
  owner_id?: string;
  is_active: boolean;
  created_at: string;
}

export interface LedgerEntryInput {
  accountCode: string;
  ownerId?: string;
  direction: EntryDirection;
  amountUgx: number | bigint | string;
}

export interface LedgerEntryRecord {
  id: string;
  transaction_id: string;
  account_id: string;
  account_code: string;
  owner_id: string;
  direction: EntryDirection;
  amount_ugx: number;
  currency: string;
  environment: LedgerEnvironment;
  created_at: string;
}

export interface LedgerTransactionRecord {
  id: string;
  event_id: string;
  idempotency_key?: string;
  transaction_type: string;
  reference_type: string;
  reference_id: string;
  currency: string;
  total_debit_ugx: number;
  total_credit_ugx: number;
  environment: LedgerEnvironment;
  status: 'POSTED' | 'REVERSED';
  description: string;
  posted_by: string;
  reversal_of_transaction_id?: string;
  entries: LedgerEntryRecord[];
  metadata: Record<string, any>;
  created_at: string;
}

export interface AccountBalanceProjection {
  id: string;
  account_id: string;
  account_code: string;
  owner_id: string;
  currency: string;
  environment: LedgerEnvironment;
  debit_total_ugx: number;
  credit_total_ugx: number;
  net_balance_ugx: number;
  last_transaction_id: string;
  version: number;
  updated_at: string;
}

export interface FinancialAuditLogRecord {
  id: string;
  actor_id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  amount_ugx?: number;
  currency: string;
  previous_state?: Record<string, any>;
  new_state?: Record<string, any>;
  reason?: string;
  ip_address?: string;
  signature_hash: string;
  environment: LedgerEnvironment;
  created_at: string;
}

export class LedgerIntegrityError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
  }
}

export const CHART_OF_ACCOUNTS: ReadonlyArray<{
  code: string;
  name: string;
  type: AccountType;
  normalBalance: EntryDirection;
}> = [
  { code: '1010_GATEWAY_CLEARING_DPO', name: 'DPO Gateway Clearing Account', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '1020_SAFEGUARDED_CUSTODY_FUNDS', name: 'Safeguarded Customer Custody Funds', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '1030_SETTLEMENT_BANK_ACCOUNT', name: 'SAFARIS Settlement Bank Account', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '2010_CUSTOMER_WALLET_LIABILITY', name: 'Customer Wallet Liability', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '2020_BOOKING_ESCROW_LIABILITY', name: 'Unearned Booking Escrow Liability', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '2030_DRIVER_PAYABLE', name: 'Driver Earnings Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '2040_GUIDE_PAYABLE', name: 'Tour Guide Earnings Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '2050_DEVELOPER_COMMISSION_PAYABLE', name: 'Contractual 5% Developer Commission Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '2060_PAYOUT_RESERVE_LIABILITY', name: 'Reserved Withdrawal Funds Liability', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '4010_SAFARIS_COMMISSION_REVENUE', name: 'SAFARIS Platform Commission Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
  { code: '5010_GATEWAY_FEE_EXPENSE', name: 'Payment & Payout Gateway Fee Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5020_CHARGEBACK_REVERSAL_EXPENSE', name: 'Chargeback & Dispute Reversal Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '3010_PLATFORM_ADJUSTMENT_CLEARING', name: 'Authorized Financial Adjustment Clearing', type: 'EQUITY', normalBalance: 'CREDIT' },
];

/**
 * Exact integer money parser for UGX.
 * Never uses floating-point arithmetic for authoritative ledger calculations.
 */
export function toExactUgxBigInt(val: number | bigint | string): bigint {
  if (typeof val === 'bigint') {
    if (val <= 0n) {
      throw new LedgerIntegrityError('INVALID_MONEY_AMOUNT', `Monetary amount must be a positive integer (got ${val.toString()}).`);
    }
    return val;
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || !Number.isInteger(val) || val <= 0) {
      throw new LedgerIntegrityError(
        'INVALID_MONEY_AMOUNT',
        `Monetary amount must be an exact positive integer in UGX without fractional decimals (got ${val}).`
      );
    }
    return BigInt(val);
  }
  const trimmed = String(val).trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new LedgerIntegrityError('INVALID_MONEY_AMOUNT', `Monetary amount must be an exact positive integer string (got "${trimmed}").`);
  }
  const parsed = BigInt(trimmed);
  if (parsed <= 0n) {
    throw new LedgerIntegrityError('INVALID_MONEY_AMOUNT', 'Monetary amount must be strictly greater than zero.');
  }
  return parsed;
}

/**
 * Deterministic ordered lock manager to prevent deadlocks when locking multiple accounts/owners.
 */
const resourceLocks = new Map<string, Promise<void>>();

export async function withOrderedLocks<T>(lockKeys: string[], fn: () => Promise<T>): Promise<T> {
  const uniqueSorted = Array.from(new Set(lockKeys)).sort();
  const releases: Array<() => void> = [];

  for (const key of uniqueSorted) {
    const prev = resourceLocks.get(key) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((res) => {
      release = res;
    });
    const chained = prev.then(() => current);
    resourceLocks.set(key, chained);
    await prev.catch(() => {});
    releases.push(() => {
      release();
      if (resourceLocks.get(key) === chained) {
        resourceLocks.delete(key);
      }
    });
  }

  try {
    return await fn();
  } finally {
    for (let i = releases.length - 1; i >= 0; i--) {
      releases[i]();
    }
  }
}

export class LedgerService {
  private static initialized = false;
  private static lastAuditHash = 'GENESIS_SAFARIS_AUDIT_CHAIN_2026';

  public static async initChartOfAccounts(): Promise<void> {
    if (this.initialized && localStore.ledger_accounts.size >= CHART_OF_ACCOUNTS.length) return;
    const now = new Date().toISOString();

    for (const def of CHART_OF_ACCOUNTS) {
      const id = `acc_${def.code.toLowerCase()}`;
      const account: LedgerAccount = {
        id,
        account_code: def.code,
        account_name: def.name,
        account_type: def.type,
        normal_balance: def.normalBalance,
        currency: 'UGX',
        owner_type: 'PLATFORM',
        is_active: true,
        created_at: now,
      };
      localStore.ledger_accounts.set(def.code, account);

      if (db.isPostgresConnected) {
        try {
          await db.query(
            `INSERT INTO ledger_accounts (id, account_code, account_name, account_type, normal_balance, currency, owner_type, is_active)
             VALUES ($1, $2, $3, $4, $5, 'UGX', 'PLATFORM', true)
             ON CONFLICT (account_code) DO NOTHING`,
            [account.id, account.account_code, account.account_name, account.account_type, account.normal_balance]
          );
        } catch (_) {}
      }
    }
    this.initialized = true;
  }

  public static getAccount(accountCode: string): LedgerAccount {
    if (!this.initialized || localStore.ledger_accounts.size === 0) {
      for (const def of CHART_OF_ACCOUNTS) {
        localStore.ledger_accounts.set(def.code, {
          id: `acc_${def.code.toLowerCase()}`,
          account_code: def.code,
          account_name: def.name,
          account_type: def.type,
          normal_balance: def.normalBalance,
          currency: 'UGX',
          owner_type: 'PLATFORM',
          is_active: true,
          created_at: new Date().toISOString(),
        });
      }
      this.initialized = true;
    }
    const acc = localStore.ledger_accounts.get(accountCode);
    if (!acc) {
      throw new LedgerIntegrityError('UNKNOWN_LEDGER_ACCOUNT', `Ledger account "${accountCode}" does not exist in Chart of Accounts.`);
    }
    return acc;
  }

  /**
   * Posts an atomic, immutable double-entry financial transaction.
   * Enforces:
   * - At least one DEBIT and one CREDIT entry
   * - Exact BigInt equality: sum(DEBIT) === sum(CREDIT)
   * - Idempotency on eventId and idempotencyKey
   * - Atomic balance projection updates with row-level & ordered locks
   */
  public static async postTransaction(params: {
    eventId: string;
    idempotencyKey?: string;
    transactionType: string;
    referenceType: string;
    referenceId: string;
    currency?: string;
    environment?: LedgerEnvironment;
    description: string;
    postedBy?: string;
    reversalOfTransactionId?: string;
    entries: LedgerEntryInput[];
    metadata?: Record<string, any>;
  }): Promise<LedgerTransactionRecord> {
    const {
      eventId,
      idempotencyKey,
      transactionType,
      referenceType,
      referenceId,
      currency = 'UGX',
      environment = (ENV.DPO_ENVIRONMENT || 'sandbox') as LedgerEnvironment,
      description,
      postedBy = 'SYSTEM',
      reversalOfTransactionId,
      entries,
      metadata = {},
    } = params;

    if (!eventId || !eventId.trim()) {
      throw new LedgerIntegrityError('MISSING_EVENT_ID', 'Every ledger posting requires a unique eventId.');
    }
    if (currency.toUpperCase() !== 'UGX') {
      throw new LedgerIntegrityError('CURRENCY_MISMATCH', `Unsupported ledger currency "${currency}". Only UGX is supported.`);
    }
    if (!Array.isArray(entries) || entries.length < 2) {
      throw new LedgerIntegrityError('INCOMPLETE_LEDGER_ENTRIES', 'A double-entry transaction requires at least 2 entries (debit and credit).');
    }

    // Validate accounts and compute exact BigInt totals before acquiring locks
    let totalDebitBig = 0n;
    let totalCreditBig = 0n;
    let hasDebit = false;
    let hasCredit = false;

    const validatedEntries = entries.map((e) => {
      const account = this.getAccount(e.accountCode);
      const amountBig = toExactUgxBigInt(e.amountUgx);
      if (e.direction === 'DEBIT') {
        totalDebitBig += amountBig;
        hasDebit = true;
      } else if (e.direction === 'CREDIT') {
        totalCreditBig += amountBig;
        hasCredit = true;
      } else {
        throw new LedgerIntegrityError('INVALID_DIRECTION', `Invalid entry direction "${e.direction}".`);
      }
      return {
        account,
        ownerId: e.ownerId || 'PLATFORM',
        direction: e.direction,
        amountBig,
      };
    });

    if (!hasDebit || !hasCredit || totalDebitBig !== totalCreditBig || totalDebitBig <= 0n) {
      throw new LedgerIntegrityError(
        'LEDGER_IMBALANCE',
        `Double-entry invariant violated: total debits (${totalDebitBig.toString()} UGX) must equal total credits (${totalCreditBig.toString()} UGX).`
      );
    }

    const lockKeys = [
      `event:${eventId}`,
      ...(idempotencyKey ? [`idem:${idempotencyKey}`] : []),
      ...validatedEntries.map((ve) => `proj:${environment}:${ve.account.account_code}:${ve.ownerId}`),
    ];

    return withOrderedLocks(lockKeys, async () => {
      // 1. Idempotency check by eventId or idempotencyKey
      for (const existing of localStore.ledger_transactions.values()) {
        if (existing.event_id === eventId || (idempotencyKey && existing.idempotency_key === idempotencyKey)) {
          return existing as LedgerTransactionRecord;
        }
      }

      const now = new Date().toISOString();
      const txId = `ltx_${Date.now()}_${uuidv4().replace(/-/g, '').substring(0, 10)}`;
      const totalUgxNum = Number(totalDebitBig);

      const entryRecords: LedgerEntryRecord[] = validatedEntries.map((ve, idx) => ({
        id: `len_${txId.slice(4)}_${idx + 1}`,
        transaction_id: txId,
        account_id: ve.account.id,
        account_code: ve.account.account_code,
        owner_id: ve.ownerId,
        direction: ve.direction,
        amount_ugx: Number(ve.amountBig),
        currency: 'UGX',
        environment,
        created_at: now,
      }));

      const txRecord: LedgerTransactionRecord = {
        id: txId,
        event_id: eventId,
        idempotency_key: idempotencyKey,
        transaction_type: transactionType,
        reference_type: referenceType,
        reference_id: referenceId,
        currency: 'UGX',
        total_debit_ugx: totalUgxNum,
        total_credit_ugx: totalUgxNum,
        environment,
        status: 'POSTED',
        description,
        posted_by: postedBy,
        reversal_of_transaction_id: reversalOfTransactionId,
        entries: Object.freeze(entryRecords.map((e) => Object.freeze({ ...e }))) as unknown as LedgerEntryRecord[],
        metadata,
        created_at: now,
      };

      // 2. Update balance projections in PostgreSQL transaction and stage memory updates
      const stagedProjections = new Map<string, AccountBalanceProjection>();

      await db.withTransaction(async (client) => {
        if (client) {
          await client.query(
            `INSERT INTO ledger_transactions (
               id, event_id, idempotency_key, transaction_type, reference_type, reference_id,
               currency, total_debit_ugx, total_credit_ugx, environment, status,
               description, posted_by, reversal_of_transaction_id, metadata, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, 'UGX', $7, $8, $9, 'POSTED', $10, $11, $12, $13, $14)`,
            [
              txRecord.id,
              txRecord.event_id,
              txRecord.idempotency_key || null,
              txRecord.transaction_type,
              txRecord.reference_type,
              txRecord.reference_id,
              txRecord.total_debit_ugx,
              txRecord.total_credit_ugx,
              txRecord.environment,
              txRecord.description,
              txRecord.posted_by,
              txRecord.reversal_of_transaction_id || null,
              JSON.stringify(txRecord.metadata || {}),
              txRecord.created_at,
            ]
          );
        }

        for (const ve of validatedEntries) {
          const projKey = `${environment}:${ve.account.account_code}:${ve.ownerId}`;
          const existingProj = localStore.account_balance_projections.get(projKey);
          const prevDebit = BigInt(existingProj?.debit_total_ugx || 0);
          const prevCredit = BigInt(existingProj?.credit_total_ugx || 0);

          const newDebit = ve.direction === 'DEBIT' ? prevDebit + ve.amountBig : prevDebit;
          const newCredit = ve.direction === 'CREDIT' ? prevCredit + ve.amountBig : prevCredit;

          // Normal balance calculation:
          // ASSET / EXPENSE: Debit - Credit
          // LIABILITY / REVENUE / EQUITY: Credit - Debit
          const netBig =
            ve.account.normal_balance === 'DEBIT' ? newDebit - newCredit : newCredit - newDebit;

          const updatedProj: AccountBalanceProjection = {
            id: projKey,
            account_id: ve.account.id,
            account_code: ve.account.account_code,
            owner_id: ve.ownerId,
            currency: 'UGX',
            environment,
            debit_total_ugx: Number(newDebit),
            credit_total_ugx: Number(newCredit),
            net_balance_ugx: Number(netBig),
            last_transaction_id: txRecord.id,
            version: (existingProj?.version || 0) + 1,
            updated_at: now,
          };
          stagedProjections.set(projKey, updatedProj);

          if (client) {
            await client.query(
              `INSERT INTO account_balance_projections (
                 id, account_id, account_code, owner_id, currency, environment,
                 debit_total_ugx, credit_total_ugx, net_balance_ugx, last_transaction_id, version, updated_at
               ) VALUES ($1, $2, $3, $4, 'UGX', $5, $6, $7, $8, $9, 1, CURRENT_TIMESTAMP)
               ON CONFLICT (account_code, owner_id, currency, environment) DO UPDATE SET
                 debit_total_ugx = EXCLUDED.debit_total_ugx,
                 credit_total_ugx = EXCLUDED.credit_total_ugx,
                 net_balance_ugx = EXCLUDED.net_balance_ugx,
                 last_transaction_id = EXCLUDED.last_transaction_id,
                 version = account_balance_projections.version + 1,
                 updated_at = CURRENT_TIMESTAMP`,
              [
                updatedProj.id,
                updatedProj.account_id,
                updatedProj.account_code,
                updatedProj.owner_id,
                updatedProj.environment,
                updatedProj.debit_total_ugx,
                updatedProj.credit_total_ugx,
                updatedProj.net_balance_ugx,
                updatedProj.last_transaction_id,
              ]
            );
          }
        }

        if (client) {
          for (const entry of entryRecords) {
            await client.query(
              `INSERT INTO ledger_entries (
                 id, transaction_id, account_id, account_code, owner_id, direction, amount_ugx, currency, environment, created_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'UGX', $8, $9)`,
              [
                entry.id,
                entry.transaction_id,
                entry.account_id,
                entry.account_code,
                entry.owner_id,
                entry.direction,
                entry.amount_ugx,
                entry.environment,
                entry.created_at,
              ]
            );
          }
        }
      });

      // 3. Atomically commit staged projections to memory store only after database transaction commit
      for (const [k, v] of stagedProjections.entries()) {
        localStore.account_balance_projections.set(k, v);
      }

      localStore.ledger_transactions.set(txRecord.id, txRecord);
      for (const entry of entryRecords) {
        localStore.ledger_entries.set(entry.id, Object.freeze({ ...entry }));
      }

      return txRecord;
    });
  }

  /**
   *Posted ledger transactions are strictly immutable; attempts to edit or delete them throw an error.
   * Corrections must use `reverseTransaction` to post an authorized compensating entry.
   */
  public static mutateOrDeletePostedTransaction(_transactionId: string): never {
    throw new LedgerIntegrityError(
      'IMMUTABLE_LEDGER_VIOLATION',
      'Posted ledger transactions and entries are immutable and cannot be modified or deleted. Use reverseTransaction() to post a compensating entry.',
      403
    );
  }

  /**
   * Creates an authorized compensating transaction that reverses a previously posted transaction.
   */
  public static async reverseTransaction(params: {
    originalTransactionId: string;
    reason: string;
    actorId: string;
    eventId?: string;
  }): Promise<LedgerTransactionRecord> {
    const original = localStore.ledger_transactions.get(params.originalTransactionId) as LedgerTransactionRecord | undefined;
    if (!original) {
      throw new LedgerIntegrityError('LEDGER_TX_NOT_FOUND', `Ledger transaction ${params.originalTransactionId} not found.`, 404);
    }
    if (original.status === 'REVERSED') {
      throw new LedgerIntegrityError('ALREADY_REVERSED', `Ledger transaction ${params.originalTransactionId} has already been reversed.`, 409);
    }

    const compensatingEntries: LedgerEntryInput[] = original.entries.map((e) => ({
      accountCode: e.account_code,
      ownerId: e.owner_id,
      direction: e.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      amountUgx: e.amount_ugx,
    }));

    const reversalTx = await this.postTransaction({
      eventId: params.eventId || `rev_${original.event_id}`,
      idempotencyKey: `rev_${original.id}`,
      transactionType: `REVERSAL_${original.transaction_type}`,
      referenceType: original.reference_type,
      referenceId: original.reference_id,
      environment: original.environment,
      description: `Compensating reversal of ${original.id}: ${params.reason}`,
      postedBy: params.actorId,
      reversalOfTransactionId: original.id,
      entries: compensatingEntries,
      metadata: { reason: params.reason, originalTransactionId: original.id },
    });

    original.status = 'REVERSED';
    return reversalTx;
  }

  public static getAccountBalance(
    accountCode: string,
    ownerId = 'PLATFORM',
    environment: LedgerEnvironment = (ENV.DPO_ENVIRONMENT || 'sandbox') as LedgerEnvironment
  ): number {
    const projKey = `${environment}:${accountCode}:${ownerId}`;
    const proj = localStore.account_balance_projections.get(projKey) as AccountBalanceProjection | undefined;
    return proj ? proj.net_balance_ugx : 0;
  }

  /**
   * Verifies that the entire double-entry ledger for the given environment is balanced:
   * Total Debits across all posted transactions == Total Credits across all posted transactions.
   */
  public static verifyTrialBalance(environment: LedgerEnvironment = 'sandbox'): {
    balanced: boolean;
    totalDebitsUgx: number;
    totalCreditsUgx: number;
    transactionCount: number;
    accountBalances: Record<string, number>;
  } {
    let totalDebits = 0n;
    let totalCredits = 0n;
    let txCount = 0;
    const accountBalances: Record<string, bigint> = {};

    for (const tx of localStore.ledger_transactions.values()) {
      if (tx.environment !== environment) continue;
      txCount++;
      for (const entry of tx.entries) {
        const amt = BigInt(entry.amount_ugx);
        if (entry.direction === 'DEBIT') {
          totalDebits += amt;
        } else {
          totalCredits += amt;
        }
        const acc = this.getAccount(entry.account_code);
        const cur = accountBalances[entry.account_code] || 0n;
        if (acc.normal_balance === entry.direction) {
          accountBalances[entry.account_code] = cur + amt;
        } else {
          accountBalances[entry.account_code] = cur - amt;
        }
      }
    }

    const formattedBalances: Record<string, number> = {};
    for (const [k, v] of Object.entries(accountBalances)) {
      formattedBalances[k] = Number(v);
    }

    return {
      balanced: totalDebits === totalCredits,
      totalDebitsUgx: Number(totalDebits),
      totalCreditsUgx: Number(totalCredits),
      transactionCount: txCount,
      accountBalances: formattedBalances,
    };
  }

  /**
   * Tamper-evident hash-chained financial audit log.
   */
  public static async recordAuditLog(params: {
    actorId: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
    amountUgx?: number;
    previousState?: Record<string, any>;
    newState?: Record<string, any>;
    reason?: string;
    ipAddress?: string;
    environment?: LedgerEnvironment;
  }): Promise<FinancialAuditLogRecord> {
    const now = new Date().toISOString();
    const id = `faud_${Date.now()}_${uuidv4().substring(0, 8)}`;
    const env = params.environment || ((ENV.DPO_ENVIRONMENT || 'sandbox') as LedgerEnvironment);

    const payloadToSign = JSON.stringify({
      prevHash: this.lastAuditHash,
      id,
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      amountUgx: params.amountUgx ?? null,
      reason: params.reason ?? null,
      env,
      now,
    });

    const signatureHash = crypto
      .createHmac('sha256', ENV.CONFIG_ENCRYPTION_SECRET)
      .update(payloadToSign)
      .digest('hex');

    this.lastAuditHash = signatureHash;

    const record: FinancialAuditLogRecord = {
      id,
      actor_id: params.actorId,
      actor_role: params.actorRole,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      amount_ugx: params.amountUgx,
      currency: 'UGX',
      previous_state: params.previousState,
      new_state: params.newState,
      reason: params.reason,
      ip_address: params.ipAddress || '',
      signature_hash: signatureHash,
      environment: env,
      created_at: now,
    };

    localStore.financial_audit_logs.set(id, Object.freeze(record));

    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO financial_audit_logs (
             id, actor_id, actor_role, action, entity_type, entity_id,
             amount_ugx, currency, previous_state, new_state, reason, ip_address, signature_hash, environment, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'UGX', $8, $9, $10, $11, $12, $13, $14)`,
          [
            record.id,
            record.actor_id,
            record.actor_role,
            record.action,
            record.entity_type,
            record.entity_id,
            record.amount_ugx ?? null,
            JSON.stringify(record.previous_state || {}),
            JSON.stringify(record.new_state || {}),
            record.reason || null,
            record.ip_address || '',
            record.signature_hash,
            record.environment,
            record.created_at,
          ]
        );
      } catch (_) {}
    }

    return record;
  }
}
