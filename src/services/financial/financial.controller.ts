import { Request, Response } from 'express';
import { FinancialService, FinancialError } from './financial.service';
import { LedgerService } from './ledger.service';
import { PayoutService } from './payout.service';
import { ReconciliationService } from './reconciliation.service';
import { FinancialOutboxService } from './outbox.service';
import { DpoPayGateway } from '../payment/dpo_gateway';
import { localStore } from '../../config/database';

export class FinancialController {
  // -------------------------------------------------------------
  // Customer Wallet Endpoints
  // -------------------------------------------------------------

  /**
   * GET /wallet/balance
   * Returns current authoritative wallet balance calculated from immutable ledger.
   */
  public static async getBalance(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user;
      const userId = authUser?.userId || authUser?.id || (req.query.userId as string);
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const env = (req.query.environment as any) || DpoPayGateway.environment;
      const balance = FinancialService.calculateWalletBalance(userId, env);

      res.json({
        userId,
        balance_ugx: balance,
        environment: env,
        currency: 'UGX',
        is_sandbox: env === 'sandbox',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve wallet balance.' });
    }
  }

  /**
   * GET /wallet/summary
   * Returns complete wallet summary: available, reserved, pending topups, deposits, spending, refunds, compliance status.
   */
  public static async getWalletSummary(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user;
      const userId = authUser?.userId || authUser?.id || (req.query.userId as string);
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const env = (req.query.environment as any) || DpoPayGateway.environment;
      const summary = FinancialService.getWalletAccountSummary(userId, env);
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve wallet summary.' });
    }
  }

  /**
   * GET /payouts
   * Returns beneficiary earnings summary and withdrawal history for the authenticated driver/guide.
   */
  public static async getUserPayouts(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user;
      const userId = authUser?.userId || authUser?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const env = (req.query.environment as any) || DpoPayGateway.environment;
      const role = String(authUser?.role || 'driver').toLowerCase();
      const beneficiaryRole: 'driver' | 'tour_guide' = role.includes('guide') ? 'tour_guide' : 'driver';
      const summary = PayoutService.getBeneficiaryEarningsSummary(userId, beneficiaryRole, env);
      const requests = PayoutService.getPayoutRequests({ userId, environment: env });
      res.json({
        beneficiaryId: userId,
        beneficiaryRole,
        environment: env,
        summary,
        payoutRequests: requests,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve payouts.' });
    }
  }

  /**
   * POST /payouts/request
   * Submits an auditable withdrawal request for verified net driver/guide earnings.
   */
  public static async requestPayout(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user;
      const userId = authUser?.userId || authUser?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const env = (req.body.environment as any) || DpoPayGateway.environment;
      const role = String(authUser?.role || req.body.beneficiaryType || 'driver').toLowerCase();
      const beneficiaryRole: 'driver' | 'tour_guide' = role.includes('guide') ? 'tour_guide' : 'driver';
      const amountUgx = Number(req.body.amountUgx);
      const user = localStore.users.get(userId);
      const accountNumber = req.body.destinationSummary || req.body.accountNumber || user?.phone || '+256770000000';

      const payoutReq = await PayoutService.requestWithdrawal({
        userId,
        beneficiaryRole,
        amountUgx,
        destinationId: req.body.destinationId,
        accountNumber,
        accountName: user?.full_name || 'Beneficiary',
        environment: env,
        idempotencyKey: req.body.idempotencyKey || `payout_req_${userId}_${Date.now()}`,
      });

      const executed = await PayoutService.executePayout(payoutReq.id, userId);
      res.json({ success: true, payout: executed });
    } catch (err: any) {
      const status = err instanceof FinancialError ? err.httpStatus : 400;
      res.status(status).json({ error: err.message || 'Failed to request payout.' });
    }
  }

  /**
   * GET /wallet/transactions
   * Returns list of immutable ledger entries for customer.
   */
  public static async getTransactions(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user;
      const userId = authUser?.userId || authUser?.id || (req.query.userId as string);
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const env = (req.query.environment as any) || DpoPayGateway.environment;
      const ledger = FinancialService.getWalletLedger(userId, env);
      const balance = FinancialService.calculateWalletBalance(userId, env);

      res.json({
        userId,
        balance_ugx: balance,
        environment: env,
        currency: 'UGX',
        count: ledger.length,
        transactions: ledger,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve transactions.' });
    }
  }

  // -------------------------------------------------------------
  // Admin Financial Management & Metrics
  // -------------------------------------------------------------

  /**
   * GET /admin/financials/overview
   * Returns comprehensive KPIs, customer liabilities, platform earnings, and reconciliation diff.
   */
  public static async getOverview(req: Request, res: Response): Promise<void> {
    try {
      const env = (req.query.environment as any) || DpoPayGateway.environment;
      const overview = FinancialService.getFinancialOverview(env);
      res.json(overview);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve financial overview.' });
    }
  }

  /**
   * GET /admin/financials/ledger
   * Returns platform earnings ledger and immutable transactions.
   */
  public static async getEarningsLedger(req: Request, res: Response): Promise<void> {
    try {
      const env = (req.query.environment as any) || DpoPayGateway.environment;
      const search = (req.query.search as string || '').toLowerCase().trim();

      let earnings = Array.from(localStore.platform_earnings.values()).filter(
        (e) => !env || e.environment === env
      );

      if (search) {
        earnings = earnings.filter(
          (e) =>
            e.booking_id.toLowerCase().includes(search) ||
            e.id.toLowerCase().includes(search) ||
            (e.payer_user_id && e.payer_user_id.toLowerCase().includes(search)) ||
            (e.beneficiary_id && e.beneficiary_id.toLowerCase().includes(search))
        );
      }

      earnings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      res.json({
        count: earnings.length,
        environment: env,
        earnings,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve earnings ledger.' });
    }
  }

  /**
   * GET /admin/refund-policies
   */
  public static async getPolicies(req: Request, res: Response): Promise<void> {
    try {
      const policies = await FinancialService.getRefundPolicies();
      res.json({ policies });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve policies.' });
    }
  }

  /**
   * PUT /admin/refund-policies/:id
   */
  public static async updatePolicy(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const adminId = (req as any).user?.id || 'ADMIN';
      const updated = await FinancialService.updateRefundPolicy(id, req.body, adminId);
      res.json({ success: true, policy: updated });
    } catch (err: any) {
      const status = err instanceof FinancialError ? err.httpStatus : 500;
      res.status(status).json({ error: err.message || 'Failed to update policy.' });
    }
  }

  /**
   * GET /admin/refunds
   */
  public static async getRefunds(req: Request, res: Response): Promise<void> {
    try {
      const env = (req.query.environment as any) || DpoPayGateway.environment;
      let refunds = Array.from(localStore.refunds.values()).filter(
        (r) => !env || r.environment === env
      );

      refunds.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      res.json({
        count: refunds.length,
        environment: env,
        refunds,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve refunds.' });
    }
  }

  /**
   * POST /admin/refunds
   * Initiate manual or policy refund
   */
  public static async createRefund(req: Request, res: Response): Promise<void> {
    try {
      const adminId = (req as any).user?.id || 'ADMIN';
      const {
        paymentId,
        bookingId,
        tripId,
        deliveryId,
        userId,
        amountUgx,
        reason,
        refundMethod,
        environment,
        notes,
      } = req.body;

      if (!userId || !amountUgx || !reason) {
        res.status(400).json({ error: 'userId, amountUgx, and reason are required.' });
        return;
      }

      const refund = await FinancialService.processRefund({
        paymentId,
        bookingId,
        tripId,
        deliveryId,
        userId,
        amountUgx: Number(amountUgx),
        reason,
        refundMethod: refundMethod || 'WALLET',
        environment: environment || DpoPayGateway.environment,
        processedBy: `ADMIN_${adminId}`,
        notes,
      });

      res.json({ success: true, refund });
    } catch (err: any) {
      const status = err instanceof FinancialError ? err.httpStatus : 500;
      res.status(status).json({ error: err.message || 'Failed to process refund.' });
    }
  }

  /**
   * POST /admin/refunds/run-worker
   * Triggers the automated no-show refund evaluation worker immediately.
   */
  public static async triggerRefundWorker(req: Request, res: Response): Promise<void> {
    try {
      const result = await FinancialService.runAutomaticRefundWorker();
      res.json({
        success: true,
        message: `Automatic refund worker finished. Evaluated ${result.evaluated} trips, processed ${result.refunded} refunds.`,
        ...result,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to execute automatic refund worker.' });
    }
  }

  /**
   * POST /admin/financial-adjustments
   * Records an auditable manual balance adjustment.
   */
  public static async recordAdjustment(req: Request, res: Response): Promise<void> {
    try {
      const adminId = (req as any).user?.id || 'ADMIN';
      const { targetType, targetId, amountUgx, adjustmentType, reason, environment } = req.body;

      if (!targetType || !targetId || !amountUgx || !adjustmentType || !reason) {
        res.status(400).json({ error: 'targetType, targetId, amountUgx, adjustmentType, and reason are required.' });
        return;
      }

      const adj = await FinancialService.recordFinancialAdjustment({
        adminId,
        targetType,
        targetId,
        amountUgx: Number(amountUgx),
        adjustmentType,
        reason,
        environment: environment || DpoPayGateway.environment,
      });

      res.json({ success: true, adjustment: adj });
    } catch (err: any) {
      const status = err instanceof FinancialError ? err.httpStatus : 500;
      res.status(status).json({ error: err.message || 'Failed to record adjustment.' });
    }
  }

  /**
   * GET /admin/financials/double-entry
   * Returns double-entry journal transactions, postings, account projections, and trial balance verification.
   */
  public static async getDoubleEntryLedger(req: Request, res: Response): Promise<void> {
    try {
      const env = (req.query.environment as any) || DpoPayGateway.environment;
      const limit = Math.min(Number(req.query.limit || 200), 500);
      const trialBalance = LedgerService.verifyTrialBalance(env);

      const transactions = Array.from(localStore.ledger_transactions.values())
        .filter((t) => !env || t.environment === env)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);

      const txIds = new Set(transactions.map((t) => t.id));
      const entries = Array.from(localStore.ledger_entries.values()).filter((e) => txIds.has(e.transaction_id));
      const accounts = Array.from(localStore.ledger_accounts.values()).filter((a) => !env || a.environment === env);
      const projections = Array.from(localStore.account_balance_projections.values());

      res.json({
        environment: env,
        trialBalance,
        accountsCount: accounts.length,
        transactionsCount: transactions.length,
        entriesCount: entries.length,
        accounts,
        projections,
        transactions: transactions.map((tx) => ({
          ...tx,
          entries: entries.filter((e) => e.transaction_id === tx.id),
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve double-entry ledger.' });
    }
  }

  /**
   * GET /admin/financials/payouts
   */
  public static async adminGetPayouts(req: Request, res: Response): Promise<void> {
    try {
      const env = (req.query.environment as any) || DpoPayGateway.environment;
      const status = req.query.status as string | undefined;
      const payouts = PayoutService.getPayoutRequests({ environment: env, status });
      res.json({
        environment: env,
        count: payouts.length,
        payouts,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve payout requests.' });
    }
  }

  /**
   * POST /admin/financials/payouts/:id/execute
   */
  public static async adminExecutePayout(req: Request, res: Response): Promise<void> {
    try {
      const adminId = (req as any).user?.id || 'ADMIN';
      const { id } = req.params;
      const result = await PayoutService.executePayout(id, `ADMIN_${adminId}`);
      res.json({ success: true, payout: result });
    } catch (err: any) {
      const status = err instanceof FinancialError ? err.httpStatus : 400;
      res.status(status).json({ error: err.message || 'Failed to execute payout.' });
    }
  }

  /**
   * POST /admin/financials/payouts/:id/reconcile
   */
  public static async adminReconcilePayout(req: Request, res: Response): Promise<void> {
    try {
      const adminId = (req as any).user?.id || 'ADMIN';
      const { id } = req.params;
      const result = await PayoutService.reconcileUncertainPayout(id, `ADMIN_${adminId}`);
      res.json({ success: true, payout: result });
    } catch (err: any) {
      const status = err instanceof FinancialError ? err.httpStatus : 400;
      res.status(status).json({ error: err.message || 'Failed to reconcile payout.' });
    }
  }

  /**
   * GET /admin/financials/reconciliation
   */
  public static async getReconciliationStatus(req: Request, res: Response): Promise<void> {
    try {
      const env = (req.query.environment as any) || DpoPayGateway.environment;
      const runs = Array.from(localStore.reconciliation_runs.values())
        .filter((r) => !env || r.environment === env)
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
        .slice(0, 25);
      const discrepancies = ReconciliationService.getDiscrepancies(env);
      const settlements = Array.from(localStore.payment_settlements.values())
        .filter((s) => !env || s.environment === env)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      res.json({
        environment: env,
        runs,
        discrepancies,
        settlements,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve reconciliation status.' });
    }
  }

  /**
   * POST /admin/financials/reconciliation/run
   */
  public static async runReconciliation(req: Request, res: Response): Promise<void> {
    try {
      const adminId = (req as any).user?.id || 'ADMIN';
      const env = (req.body.environment as any) || (req.query.environment as any) || DpoPayGateway.environment;
      const result = await ReconciliationService.runReconciliation(env, `ADMIN_${adminId}`);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to run reconciliation.' });
    }
  }

  /**
   * POST /admin/financials/settlements/import
   */
  public static async importSettlementReport(req: Request, res: Response): Promise<void> {
    try {
      const adminId = (req as any).user?.id || 'ADMIN';
      const env = (req.body.environment as any) || DpoPayGateway.environment;
      const { rows, records } = req.body;
      const settlementRows = Array.isArray(rows) ? rows : Array.isArray(records) ? records : null;
      if (!settlementRows) {
        res.status(400).json({ error: 'rows or records array is required.' });
        return;
      }
      const result = await ReconciliationService.importSettlementReport({
        rows: settlementRows,
        environment: env,
        actorId: `ADMIN_${adminId}`,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to import settlement report.' });
    }
  }

  /**
   * GET /admin/financials/audit-logs
   */
  public static async getFinancialAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const logs = Array.from(localStore.financial_audit_logs.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 200);
      res.json({ count: logs.length, logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve financial audit logs.' });
    }
  }

  /**
   * GET /admin/financials/outbox
   */
  public static async getOutboxStatus(req: Request, res: Response): Promise<void> {
    try {
      const jobs = FinancialOutboxService.getAllJobs();
      res.json({ count: jobs.length, jobs: jobs.slice(0, 100) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve outbox status.' });
    }
  }
}
