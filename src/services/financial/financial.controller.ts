import { Request, Response } from 'express';
import { FinancialService, FinancialError } from './financial.service';
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
}
