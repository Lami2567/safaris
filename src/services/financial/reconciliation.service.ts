import { v4 as uuidv4 } from 'uuid';
import { db, localStore } from '../../config/database';
import { ENV } from '../../config/env';
import { LedgerEnvironment, LedgerService, toExactUgxBigInt } from './ledger.service';
import { FinancialService } from './financial.service';

export type DiscrepancySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ReconciliationDiscrepancyRecord {
  id: string;
  run_id: string;
  discrepancy_type:
    | 'MISSING_LEDGER_POSTING'
    | 'PAYMENT_AMOUNT_MISMATCH'
    | 'CURRENCY_MISMATCH'
    | 'WALLET_PROJECTION_DRIFT'
    | 'NEGATIVE_WALLET_BALANCE'
    | 'SETTLEMENT_MISMATCH'
    | 'UNSETTLED_CLEARING_ITEM'
    | 'UNCERTAIN_PAYOUT_OUTCOME'
    | 'FAILED_REFUND'
    | 'TRIAL_BALANCE_IMBALANCE';
  severity: DiscrepancySeverity;
  reference_type: string;
  reference_id: string;
  expected_amount_ugx?: number;
  actual_amount_ugx?: number;
  currency: string;
  description: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE_POSITIVE';
  environment: LedgerEnvironment;
  resolved_by?: string;
  resolved_at?: string;
  resolution_notes?: string;
  created_at: string;
}

export interface ReconciliationRunRecord {
  id: string;
  environment: LedgerEnvironment;
  triggered_by: string;
  status: 'COMPLETED' | 'COMPLETED_WITH_DISCREPANCIES';
  total_payments_checked: number;
  total_ledger_tx_checked: number;
  total_wallets_checked: number;
  discrepancies_found: number;
  discrepancies: ReconciliationDiscrepancyRecord[];
  summary: Record<string, any>;
  started_at: string;
  completed_at: string;
}

export interface SettlementReportRow {
  settlementReference: string;
  dpoTransToken?: string;
  merchantReference?: string;
  paymentId?: string;
  grossAmountUgx: number;
  gatewayFeeUgx: number;
  netSettledUgx: number;
  currency?: string;
  settlementDate?: string;
}

export class ReconciliationService {
  /**
   * Runs a comprehensive reconciliation comparing:
   * 1. Internal Double-Entry Trial Balance
   * 2. Verified DPO Payments vs. Ledger Postings
   * 3. Customer Wallet Projections vs. Ledger Liability (`2010_CUSTOMER_WALLET_LIABILITY`)
   * 4. Uncertain Payouts & Failed Refunds
   * Never silently modifies balances to force reconciliation.
   */
  public static async runReconciliation(
    environment: LedgerEnvironment = (ENV.DPO_ENVIRONMENT || 'sandbox') as LedgerEnvironment,
    triggeredBy = 'SCHEDULED_WORKER'
  ): Promise<ReconciliationRunRecord> {
    const startedAt = new Date().toISOString();
    const runId = `rec_${Date.now()}_${uuidv4().substring(0, 8)}`;
    const discrepancies: ReconciliationDiscrepancyRecord[] = [];

    const addDiscrepancy = (
      params: Omit<ReconciliationDiscrepancyRecord, 'id' | 'run_id' | 'currency' | 'status' | 'environment' | 'created_at'>
    ) => {
      const disc: ReconciliationDiscrepancyRecord = {
        id: `disc_${Date.now()}_${uuidv4().substring(0, 8)}`,
        run_id: runId,
        currency: 'UGX',
        status: 'OPEN',
        environment,
        created_at: new Date().toISOString(),
        ...params,
      };
      discrepancies.push(disc);
      localStore.reconciliation_discrepancies.set(disc.id, disc);
    };

    // 1. Check Double-Entry Trial Balance
    const trial = LedgerService.verifyTrialBalance(environment);
    if (!trial.balanced) {
      addDiscrepancy({
        discrepancy_type: 'TRIAL_BALANCE_IMBALANCE',
        severity: 'CRITICAL',
        reference_type: 'LEDGER',
        reference_id: 'TRIAL_BALANCE',
        expected_amount_ugx: trial.totalDebitsUgx,
        actual_amount_ugx: trial.totalCreditsUgx,
        description: `Trial balance mismatch: Debits=${trial.totalDebitsUgx} UGX, Credits=${trial.totalCreditsUgx} UGX`,
      });
    }

    // 2. Check Verified Payments vs. Ledger Postings
    let paymentsChecked = 0;
    for (const payment of localStore.payments.values()) {
      if (payment.environment !== environment) continue;
      paymentsChecked++;

      if (payment.requires_review && payment.review_reason) {
        addDiscrepancy({
          discrepancy_type: payment.review_reason.toLowerCase().includes('currency')
            ? 'CURRENCY_MISMATCH'
            : 'PAYMENT_AMOUNT_MISMATCH',
          severity: 'HIGH',
          reference_type: 'PAYMENT',
          reference_id: payment.id,
          expected_amount_ugx: Number(payment.amount_ugx || 0),
          description: payment.review_reason,
        });
      }

      if (payment.status === 'SUCCESSFUL' && !payment.duplicate_of_payment_id) {
        const expectedAmount = Math.round(Number(payment.amount_ugx || 0));
        let matchingLedgerTx: any = null;
        for (const ltx of localStore.ledger_transactions.values()) {
          if (
            ltx.environment === environment &&
            (ltx.reference_id === payment.id ||
              (ltx.metadata && ltx.metadata.paymentId === payment.id))
          ) {
            matchingLedgerTx = ltx;
            break;
          }
        }

        if (!matchingLedgerTx) {
          addDiscrepancy({
            discrepancy_type: 'MISSING_LEDGER_POSTING',
            severity: 'CRITICAL',
            reference_type: 'PAYMENT',
            reference_id: payment.id,
            expected_amount_ugx: expectedAmount,
            actual_amount_ugx: 0,
            description: `Verified payment ${payment.id} (${payment.transaction_id}) has no corresponding double-entry ledger transaction.`,
          });
        } else if (Number(matchingLedgerTx.total_debit_ugx) !== expectedAmount) {
          addDiscrepancy({
            discrepancy_type: 'PAYMENT_AMOUNT_MISMATCH',
            severity: 'CRITICAL',
            reference_type: 'PAYMENT',
            reference_id: payment.id,
            expected_amount_ugx: expectedAmount,
            actual_amount_ugx: Number(matchingLedgerTx.total_debit_ugx),
            description: `Payment ${payment.id} amount (${expectedAmount} UGX) differs from ledger posting ${matchingLedgerTx.id} (${matchingLedgerTx.total_debit_ugx} UGX).`,
          });
        }
      }
    }

    // 3. Check Customer Wallets vs. Double-Entry Liability (`2010_CUSTOMER_WALLET_LIABILITY`)
    let walletsChecked = 0;
    for (const user of localStore.users.values()) {
      walletsChecked++;
      const walletTxBalance = FinancialService.calculateWalletBalance(user.id, environment);
      const ledgerLiabilityBalance = LedgerService.getAccountBalance(
        '2010_CUSTOMER_WALLET_LIABILITY',
        user.id,
        environment
      );

      if (walletTxBalance < 0 || ledgerLiabilityBalance < 0) {
        addDiscrepancy({
          discrepancy_type: 'NEGATIVE_WALLET_BALANCE',
          severity: 'CRITICAL',
          reference_type: 'USER_WALLET',
          reference_id: user.id,
          expected_amount_ugx: 0,
          actual_amount_ugx: Math.min(walletTxBalance, ledgerLiabilityBalance),
          description: `User ${user.id} has an unexpected negative wallet balance (${walletTxBalance} UGX).`,
        });
      }

      if (walletTxBalance !== ledgerLiabilityBalance) {
        addDiscrepancy({
          discrepancy_type: 'WALLET_PROJECTION_DRIFT',
          severity: 'HIGH',
          reference_type: 'USER_WALLET',
          reference_id: user.id,
          expected_amount_ugx: ledgerLiabilityBalance,
          actual_amount_ugx: walletTxBalance,
          description: `Wallet transaction sum (${walletTxBalance} UGX) differs from double-entry liability projection (${ledgerLiabilityBalance} UGX) for user ${user.id}.`,
        });
      }
    }

    // 4. Check Uncertain Payouts & Failed Refunds
    for (const payout of localStore.payout_requests.values()) {
      if (payout.environment === environment && payout.status === 'UNCERTAIN_TIMEOUT') {
        addDiscrepancy({
          discrepancy_type: 'UNCERTAIN_PAYOUT_OUTCOME',
          severity: 'HIGH',
          reference_type: 'PAYOUT',
          reference_id: payout.id,
          expected_amount_ugx: Number(payout.amount_ugx),
          description: `Payout ${payout.payout_reference} is in UNCERTAIN_TIMEOUT and requires provider status verification.`,
        });
      }
    }

    for (const refund of localStore.refunds.values()) {
      if (refund.environment === environment && refund.status === 'FAILED') {
        addDiscrepancy({
          discrepancy_type: 'FAILED_REFUND',
          severity: 'HIGH',
          reference_type: 'REFUND',
          reference_id: refund.id,
          expected_amount_ugx: Number(refund.amount_ugx),
          description: `Refund ${refund.refund_reference} failed: ${refund.failure_reason || 'Unknown error'}`,
        });
      }
    }

    const completedAt = new Date().toISOString();
    const runRecord: ReconciliationRunRecord = {
      id: runId,
      environment,
      triggered_by: triggeredBy,
      status: discrepancies.length === 0 ? 'COMPLETED' : 'COMPLETED_WITH_DISCREPANCIES',
      total_payments_checked: paymentsChecked,
      total_ledger_tx_checked: trial.transactionCount,
      total_wallets_checked: walletsChecked,
      discrepancies_found: discrepancies.length,
      discrepancies,
      summary: {
        trialBalanceBalanced: trial.balanced,
        totalDebitsUgx: trial.totalDebitsUgx,
        totalCreditsUgx: trial.totalCreditsUgx,
        accountBalances: trial.accountBalances,
      },
      started_at: startedAt,
      completed_at: completedAt,
    };

    localStore.reconciliation_runs.set(runId, runRecord);

    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO reconciliation_runs (
             id, environment, triggered_by, status, total_payments_checked,
             total_ledger_tx_checked, total_wallets_checked, discrepancies_found, summary, started_at, completed_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            runRecord.id,
            runRecord.environment,
            runRecord.triggered_by,
            runRecord.status,
            runRecord.total_payments_checked,
            runRecord.total_ledger_tx_checked,
            runRecord.total_wallets_checked,
            runRecord.discrepancies_found,
            JSON.stringify(runRecord.summary),
            runRecord.started_at,
            runRecord.completed_at,
          ]
        );
        for (const d of discrepancies) {
          await db.query(
            `INSERT INTO reconciliation_discrepancies (
               id, run_id, discrepancy_type, severity, reference_type, reference_id,
               expected_amount_ugx, actual_amount_ugx, currency, description, status, environment, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'UGX', $9, 'OPEN', $10, $11)`,
            [
              d.id,
              d.run_id,
              d.discrepancy_type,
              d.severity,
              d.reference_type,
              d.reference_id,
              d.expected_amount_ugx ?? null,
              d.actual_amount_ugx ?? null,
              d.description,
              d.environment,
              d.created_at,
            ]
          );
        }
      } catch (_) {}
    }

    return runRecord;
  }

  /**
   * Controlled Settlement Report Importer & Reconciler.
   * Matches official DPO settlement rows against internal verified payments, posts
   * bank settlement + gateway fee entries to the double-entry ledger, and flags any discrepancies.
   */
  public static getDiscrepancies(environment?: LedgerEnvironment): ReconciliationDiscrepancyRecord[] {
    return Array.from(localStore.reconciliation_discrepancies.values())
      .filter((d) => !environment || d.environment === environment)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public static async importSettlementReport(params: {
    rows: SettlementReportRow[];
    environment?: LedgerEnvironment;
    actorId?: string;
  }): Promise<{
    settledCount: number;
    discrepancyCount: number;
    discrepancies: ReconciliationDiscrepancyRecord[];
  }> {
    const environment = params.environment || ((ENV.DPO_ENVIRONMENT || 'sandbox') as LedgerEnvironment);
    const actorId = params.actorId || 'ADMIN_SETTLEMENT_IMPORT';
    let settledCount = 0;
    const discrepancies: ReconciliationDiscrepancyRecord[] = [];

    for (const row of params.rows) {
      const grossBig = toExactUgxBigInt(row.grossAmountUgx);
      const feeBig = row.gatewayFeeUgx === 0 ? 0n : toExactUgxBigInt(row.gatewayFeeUgx);
      const netBig = toExactUgxBigInt(row.netSettledUgx);

      if (feeBig + netBig !== grossBig) {
        const disc: ReconciliationDiscrepancyRecord = {
          id: `disc_settle_${Date.now()}_${uuidv4().substring(0, 6)}`,
          run_id: 'SETTLEMENT_IMPORT',
          discrepancy_type: 'SETTLEMENT_MISMATCH',
          severity: 'CRITICAL',
          reference_type: 'SETTLEMENT',
          reference_id: row.settlementReference,
          expected_amount_ugx: Number(grossBig),
          actual_amount_ugx: Number(feeBig + netBig),
          currency: 'UGX',
          description: `Settlement ${row.settlementReference} net (${netBig}) + fee (${feeBig}) != gross (${grossBig}).`,
          status: 'OPEN',
          environment,
          created_at: new Date().toISOString(),
        };
        discrepancies.push(disc);
        localStore.reconciliation_discrepancies.set(disc.id, disc);
        continue;
      }

      // Locate matching payment
      let matchedPayment: any = null;
      for (const p of localStore.payments.values()) {
        if (
          p.environment === environment &&
          ((row.paymentId && p.id === row.paymentId) ||
            (row.dpoTransToken && p.dpo_trans_token === row.dpoTransToken) ||
            (row.merchantReference && p.transaction_id === row.merchantReference))
        ) {
          matchedPayment = p;
          break;
        }
      }

      if (!matchedPayment || matchedPayment.status !== 'SUCCESSFUL') {
        const disc: ReconciliationDiscrepancyRecord = {
          id: `disc_settle_${Date.now()}_${uuidv4().substring(0, 6)}`,
          run_id: 'SETTLEMENT_IMPORT',
          discrepancy_type: 'SETTLEMENT_MISMATCH',
          severity: 'CRITICAL',
          reference_type: 'SETTLEMENT',
          reference_id: row.settlementReference,
          expected_amount_ugx: matchedPayment ? Number(matchedPayment.amount_ugx) : 0,
          actual_amount_ugx: Number(grossBig),
          currency: 'UGX',
          description: `Settlement ${row.settlementReference} references missing or unverified payment (${row.merchantReference || row.dpoTransToken || row.paymentId}).`,
          status: 'OPEN',
          environment,
          created_at: new Date().toISOString(),
        };
        discrepancies.push(disc);
        localStore.reconciliation_discrepancies.set(disc.id, disc);
        continue;
      }

      if (BigInt(Math.round(Number(matchedPayment.amount_ugx))) !== grossBig) {
        const disc: ReconciliationDiscrepancyRecord = {
          id: `disc_settle_${Date.now()}_${uuidv4().substring(0, 6)}`,
          run_id: 'SETTLEMENT_IMPORT',
          discrepancy_type: 'SETTLEMENT_MISMATCH',
          severity: 'CRITICAL',
          reference_type: 'PAYMENT',
          reference_id: matchedPayment.id,
          expected_amount_ugx: Math.round(Number(matchedPayment.amount_ugx)),
          actual_amount_ugx: Number(grossBig),
          currency: 'UGX',
          description: `Settlement gross amount (${grossBig} UGX) does not match internal verified payment ${matchedPayment.id} (${matchedPayment.amount_ugx} UGX).`,
          status: 'OPEN',
          environment,
          created_at: new Date().toISOString(),
        };
        discrepancies.push(disc);
        localStore.reconciliation_discrepancies.set(disc.id, disc);
        continue;
      }

      // Post balanced settlement journal entry:
      // DEBIT Settlement Bank Account (net) + DEBIT Gateway Fee Expense (fee) -> CREDIT DPO Gateway Clearing (gross)
      const entries: Array<{ accountCode: string; ownerId?: string; direction: 'DEBIT' | 'CREDIT'; amountUgx: bigint }> = [
        { accountCode: '1030_SETTLEMENT_BANK_ACCOUNT', ownerId: 'PLATFORM', direction: 'DEBIT', amountUgx: netBig },
        { accountCode: '1010_GATEWAY_CLEARING_DPO', ownerId: 'PLATFORM', direction: 'CREDIT', amountUgx: grossBig },
      ];
      if (feeBig > 0n) {
        entries.push({ accountCode: '5010_GATEWAY_FEE_EXPENSE', ownerId: 'PLATFORM', direction: 'DEBIT', amountUgx: feeBig });
      }

      const ltx = await LedgerService.postTransaction({
        eventId: `evt_settlement_${row.settlementReference}`,
        idempotencyKey: `settle_${row.settlementReference}`,
        transactionType: 'PROVIDER_SETTLEMENT',
        referenceType: 'SETTLEMENT',
        referenceId: row.settlementReference,
        environment,
        description: `DPO settlement ${row.settlementReference} for payment ${matchedPayment.id}`,
        postedBy: actorId,
        entries,
        metadata: { paymentId: matchedPayment.id, grossUgx: Number(grossBig), feeUgx: Number(feeBig), netUgx: Number(netBig) },
      });

      const settlementRecord = {
        id: `stl_${Date.now()}_${uuidv4().substring(0, 6)}`,
        settlement_reference: row.settlementReference,
        provider: 'DPO',
        payment_id: matchedPayment.id,
        dpo_trans_token: matchedPayment.dpo_trans_token,
        gross_amount_ugx: Number(grossBig),
        gateway_fee_ugx: Number(feeBig),
        net_settled_ugx: Number(netBig),
        currency: 'UGX',
        settlement_status: 'SETTLED',
        settlement_date: row.settlementDate || new Date().toISOString(),
        ledger_transaction_id: ltx.id,
        environment,
        created_at: new Date().toISOString(),
      };
      localStore.payment_settlements.set(settlementRecord.id, settlementRecord);
      settledCount++;
    }

    return {
      settledCount,
      discrepancyCount: discrepancies.length,
      discrepancies,
    };
  }
}
