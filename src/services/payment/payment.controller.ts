import { Request, Response } from 'express';
import { PaymentService, PaymentError, PaymentRecord } from './payment.service';
import { DpoPayGateway, escapeXml } from './dpo_gateway';
import { sendSuccess, sendError } from '../../shared/response';
import { ENV } from '../../config/env';

function extractXmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : null;
}

export class PaymentController {
  /**
   * Initiates payment for an eligible booking, trip, delivery or wallet top-up.
   * POST /api/v1/payments/process
   */
  public static async processPayment(req: Request, res: Response) {
    try {
      const authUser = (req as any).user;
      const userId = authUser?.userId || req.body.userId;
      if (!userId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication is required to initiate payments.', 401);
      }

      const payment = await PaymentService.processPayment({
        userId,
        referenceType: req.body.referenceType,
        referenceId: req.body.referenceId,
        amountUgx: req.body.amountUgx ? Number(req.body.amountUgx) : undefined,
        paymentMethod: req.body.paymentMethod,
        phone: req.body.phone,
        customerName: req.body.customerName || authUser?.fullName,
        customerEmail: req.body.customerEmail || authUser?.email,
        description: req.body.description,
        redirectUrl: req.body.redirectUrl,
        backUrl: req.body.backUrl,
        idempotencyKey: req.body.idempotencyKey || req.headers['x-idempotency-key'],
        cardDetails: req.body.cardDetails,
      });

      const responsePayload = authUser?.role === 'admin' ? payment : PaymentService.toPublicView(payment);
      return sendSuccess(res, responsePayload, 201);
    } catch (err: any) {
      if (err instanceof PaymentError) {
        return sendError(res, err.code, err.message, err.httpStatus);
      }
      return sendError(res, 'PAYMENT_INIT_ERROR', err.message || 'Payment initiation failed.', 400);
    }
  }

  /**
   * Authoritative server-side payment verification via DPO verifyToken API.
   * POST /api/v1/payments/:id/verify
   */
  public static async verifyPayment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const authUser = (req as any).user;
      const isAdmin = authUser?.role === 'admin';

      const verified = await PaymentService.verifyPayment(id, {
        source: 'customer',
        requesterUserId: authUser?.userId,
        isAdmin,
      });

      const responsePayload = isAdmin ? verified : PaymentService.toPublicView(verified);
      return sendSuccess(res, responsePayload);
    } catch (err: any) {
      if (err instanceof PaymentError) {
        return sendError(res, err.code, err.message, err.httpStatus);
      }
      return sendError(res, 'VERIFICATION_FAILED', err.message, 400);
    }
  }

  /**
   * Handles DPO payment callbacks (both server-to-server push notifications and browser redirects).
   * GET/POST /api/v1/payments/dpo/callback
   */
  public static async handleDpoCallback(req: Request, res: Response) {
    try {
      // 1. Check for DPO server-to-server pushPayments notification (XML body)
      const rawBody = typeof req.body === 'string' ? req.body : '';
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      const isXmlPush =
        contentType.includes('xml') ||
        rawBody.includes('<API3G>') ||
        (typeof req.body === 'object' && req.body && 'API3G' in req.body);

      if (isXmlPush) {
        const transToken = extractXmlTag(rawBody, 'TransactionToken') || '';
        const transRef = extractXmlTag(rawBody, 'TransactionRef') || extractXmlTag(rawBody, 'CompanyRef') || undefined;

        console.log(`[DPO Pay] Received pushPayments XML notification | token=${transToken.slice(0, 8)}... | ref=${transRef || 'n/a'}`);

        if (transToken || transRef) {
          await PaymentService.handleDpoCallback(transToken || undefined, 'push', transRef);
        }

        // DPO pushPayments specification mandates returning <?xml version="1.0" encoding="utf-8"?><API3G><Response>OK</Response></API3G>
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        return res.status(200).send('<?xml version="1.0" encoding="utf-8"?>\n<API3G>\n  <Response>OK</Response>\n</API3G>');
      }

      // 2. Handle Browser Redirects (GET / POST)
      const transToken = (
        req.query.TransactionToken ||
        req.query.TransToken ||
        req.query.transToken ||
        (typeof req.body === 'object' ? req.body?.TransactionToken || req.body?.TransToken : '')
      ) as string | undefined;

      const companyRef = (
        req.query.CompanyRef ||
        req.query.companyRef ||
        req.query.TransID ||
        (typeof req.body === 'object' ? req.body?.CompanyRef : '')
      ) as string | undefined;

      if (!transToken && !companyRef) {
        return sendError(res, 'MISSING_TOKEN', 'No TransactionToken or CompanyRef provided in callback.', 400);
      }

      const verified = await PaymentService.handleDpoCallback(transToken, 'redirect', companyRef);

      if (!verified) {
        return sendError(res, 'PAYMENT_NOT_FOUND', 'Could not locate payment matching transaction token or reference.', 404);
      }

      // If requested by a web browser, render a user-friendly verification bridge page
      if (req.accepts('html') && !req.xhr && req.headers['sec-fetch-dest'] !== 'empty') {
        return res.send(PaymentController.renderPaymentResultHtml(verified));
      }

      return sendSuccess(res, PaymentService.toPublicView(verified));
    } catch (err: any) {
      console.error('[DPO Pay Callback Error]', err);
      return sendError(res, 'CALLBACK_FAILED', err.message || 'Callback handling failed.', 500);
    }
  }

  /**
   * Handles DPO cancel returns (customer pressed cancel / BackURL).
   * GET/POST /api/v1/payments/dpo/cancel
   */
  public static async handleDpoCancel(req: Request, res: Response) {
    try {
      const transToken = (
        req.query.TransactionToken ||
        req.query.TransToken ||
        req.query.transToken ||
        (typeof req.body === 'object' ? req.body?.TransactionToken || req.body?.TransToken : '')
      ) as string | undefined;

      const companyRef = (
        req.query.CompanyRef ||
        req.query.companyRef ||
        (typeof req.body === 'object' ? req.body?.CompanyRef : '')
      ) as string | undefined;

      const cancelled = await PaymentService.handleDpoCancel(transToken, companyRef);

      if (!cancelled) {
        return sendError(res, 'PAYMENT_NOT_FOUND', 'Could not locate payment transaction.', 404);
      }

      if (req.accepts('html') && !req.xhr && req.headers['sec-fetch-dest'] !== 'empty') {
        return res.send(PaymentController.renderPaymentResultHtml(cancelled));
      }

      return sendSuccess(res, PaymentService.toPublicView(cancelled));
    } catch (err: any) {
      return sendError(res, 'CANCEL_HANDLER_FAILED', err.message, 500);
    }
  }

  /**
   * Retrieves the current payment status for a specific booking / trip / delivery.
   * GET /api/v1/payments/reference/:type/:id
   */
  public static getPaymentByReference(req: Request, res: Response) {
    try {
      const { type, id } = req.params;
      const authUser = (req as any).user;
      const payment = PaymentService.getPaymentByReference(type as any, id);

      if (!payment) {
        return sendError(res, 'NOT_FOUND', 'No payment record found for this reference.', 404);
      }

      // Check ownership if not admin
      if (authUser && authUser.role !== 'admin' && payment.user_id !== authUser.userId) {
        return sendError(res, 'FORBIDDEN', 'Access denied to this payment record.', 403);
      }

      const responsePayload = authUser?.role === 'admin' ? payment : PaymentService.toPublicView(payment);
      return sendSuccess(res, responsePayload);
    } catch (err: any) {
      return sendError(res, 'FETCH_FAILED', err.message, 500);
    }
  }

  /**
   * Retrieves payment history for the authenticated user.
   * GET /api/v1/payments/history/:userId
   */
  public static getPaymentHistory(req: Request, res: Response) {
    try {
      const authUser = (req as any).user;
      const targetUserId = req.params.userId || authUser?.userId;

      if (!targetUserId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      if (authUser && authUser.role !== 'admin' && authUser.userId !== targetUserId) {
        return sendError(res, 'FORBIDDEN', 'You can only view your own payment history.', 403);
      }

      const history = PaymentService.getPaymentHistory(targetUserId);
      const publicHistory = authUser?.role === 'admin' ? history : history.map((p) => PaymentService.toPublicView(p));
      return sendSuccess(res, publicHistory);
    } catch (err: any) {
      return sendError(res, 'PAYMENT_HISTORY_FAILED', err.message, 500);
    }
  }

  /**
   * Wallet Top-Up Endpoint: Initiates a DPO payment for wallet funding instead of unverified credits.
   * POST /api/v1/payments/topup
   */
  public static async topUpWallet(req: Request, res: Response) {
    try {
      const authUser = (req as any).user;
      const userId = authUser?.userId || req.body.userId;
      if (!userId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      const amountUGX = Number(req.body.amountUGX || req.body.amountUgx || req.body.amount || 0);
      const paymentMethod = req.body.paymentMethod || 'MTN_MOMO';

      // Safe DPO payment initiation for WALLET funding
      const payment = await PaymentService.processPayment({
        userId,
        referenceType: 'WALLET',
        referenceId: userId,
        amountUgx: amountUGX,
        paymentMethod,
        phone: req.body.phone || authUser?.phone,
        customerName: req.body.customerName || authUser?.fullName,
        customerEmail: req.body.customerEmail || authUser?.email,
        description: `Mumwe Safaris Wallet Top-Up: UGX ${amountUGX.toLocaleString()}`,
        redirectUrl: req.body.redirectUrl,
        backUrl: req.body.backUrl,
        idempotencyKey: req.body.idempotencyKey,
      });

      return sendSuccess(res, PaymentService.toPublicView(payment), 201);
    } catch (err: any) {
      if (err instanceof PaymentError) {
        return sendError(res, err.code, err.message, err.httpStatus);
      }
      return sendError(res, 'TOPUP_INIT_FAILED', err.message || 'Wallet top-up initiation failed.', 400);
    }
  }

  // ---------------------------------------------------------------------------
  // Admin Endpoints (Protected by requireRole('admin'))
  // ---------------------------------------------------------------------------

  /**
   * Admin: List payments with filtering, search, and pagination.
   * GET /api/v1/admin/payments
   */
  public static adminListPayments(req: Request, res: Response) {
    try {
      const result = PaymentService.listPayments({
        search: req.query.search as string,
        status: req.query.status as string,
        environment: req.query.environment as string,
        method: req.query.method as string,
        referenceType: req.query.referenceType as string,
        from: req.query.from as string,
        to: req.query.to as string,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      });
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'ADMIN_PAYMENTS_ERROR', err.message, 500);
    }
  }

  /**
   * Admin: Aggregated payment statistics with strict sandbox vs live isolation.
   * GET /api/v1/admin/payments/stats
   */
  public static adminGetPaymentStats(_req: Request, res: Response) {
    try {
      const stats = PaymentService.getPaymentStats();
      return sendSuccess(res, stats);
    } catch (err: any) {
      return sendError(res, 'ADMIN_STATS_ERROR', err.message, 500);
    }
  }

  /**
   * Admin: Get sanitized DPO configuration status and production activation checklist.
   * GET /api/v1/admin/payments/config-status
   */
  public static adminGetConfigStatus(_req: Request, res: Response) {
    try {
      const status = PaymentService.getConfigStatus();
      return sendSuccess(res, status);
    } catch (err: any) {
      return sendError(res, 'CONFIG_STATUS_ERROR', err.message, 500);
    }
  }

  /**
   * Admin: Force server-side reconciliation for an individual payment.
   * POST /api/v1/admin/payments/:id/reconcile
   */
  public static async adminReconcilePayment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const authUser = (req as any).user;
      const reconciled = await PaymentService.verifyPayment(id, {
        source: 'admin',
        actor: authUser?.userId,
        isAdmin: true,
      });
      return sendSuccess(res, reconciled);
    } catch (err: any) {
      if (err instanceof PaymentError) {
        return sendError(res, err.code, err.message, err.httpStatus);
      }
      return sendError(res, 'RECONCILIATION_FAILED', err.message, 400);
    }
  }

  /**
   * Admin: Trigger batch reconciliation for all pending transactions in the active environment.
   * POST /api/v1/admin/payments/reconcile-open
   */
  public static async adminReconcileOpen(_req: Request, res: Response) {
    try {
      const result = await PaymentService.reconcileOpenPayments({ minAgeMs: 0 });
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'BATCH_RECONCILE_ERROR', err.message, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // User-Facing HTML Bridge for Browser Redirects
  // ---------------------------------------------------------------------------
  private static renderPaymentResultHtml(payment: PaymentRecord): string {
    const isSuccess = payment.status === 'SUCCESSFUL';
    const isCancelled = payment.status === 'CANCELLED';
    const isPending = payment.status === 'INITIATED' || payment.status === 'PENDING' || payment.status === 'PROCESSING';

    const statusTitle = isSuccess
      ? 'Payment Confirmed'
      : isCancelled
      ? 'Payment Cancelled'
      : isPending
      ? 'Payment Processing'
      : 'Payment Incomplete';

    const statusColor = isSuccess ? '#16a34a' : isCancelled ? '#ca8a04' : isPending ? '#2563eb' : '#dc2626';
    const envBadge =
      payment.environment === 'sandbox'
        ? '<span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;display:inline-block;margin-bottom:12px;">SANDBOX TEST PAYMENT</span>'
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mumwe Safaris — ${statusTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 90vh; }
    .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); max-width: 480px; width: 100%; padding: 32px; text-align: center; }
    .badge { width: 64px; height: 64px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; }
    h1 { font-size: 22px; margin: 0 0 8px; color: #0f172a; }
    p { margin: 6px 0; color: #475569; font-size: 14px; }
    .details { background: #f1f5f9; border-radius: 12px; padding: 16px; margin: 20px 0; text-align: left; font-size: 13px; }
    .details-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .details-label { color: #64748b; }
    .details-val { font-weight: 600; color: #0f172a; }
    .btn { display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px; margin-top: 12px; }
    .btn:hover { background: #1e293b; }
  </style>
</head>
<body>
  <div class="card">
    ${envBadge}
    <div class="badge" style="background: ${statusColor}15; color: ${statusColor};">
      <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        ${
          isSuccess
            ? '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />'
            : isCancelled
            ? '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />'
            : isPending
            ? '<circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/>'
            : '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>'
        }
      </svg>
    </div>
    <h1>${statusTitle}</h1>
    <p>${escapeXml(PaymentService.customerMessage(payment))}</p>
    
    <div class="details">
      <div class="details-row"><span class="details-label">Reference</span><span class="details-val">${escapeXml(payment.transaction_id)}</span></div>
      <div class="details-row"><span class="details-label">Amount</span><span class="details-val">UGX ${payment.amount_ugx.toLocaleString()}</span></div>
      <div class="details-row"><span class="details-label">Method</span><span class="details-val">${escapeXml(payment.payment_method)}</span></div>
      <div class="details-row"><span class="details-label">Status</span><span class="details-val" style="color:${statusColor}">${payment.status}</span></div>
      ${payment.dpo_approval_code ? `<div class="details-row"><span class="details-label">Approval Code</span><span class="details-val">${escapeXml(payment.dpo_approval_code)}</span></div>` : ''}
    </div>

    <a href="mumwesafaris://payment-complete?id=${encodeURIComponent(payment.id)}&status=${encodeURIComponent(payment.status)}" class="btn">
      Return to Mumwe Safaris App
    </a>
  </div>
</body>
</html>`;
  }

  /**
   * GET /api/v1/payments/cards
   * Returns saved cards for authenticated user.
   */
  public static getUserCards(req: Request, res: Response) {
    try {
      const authUser = (req as any).user;
      const userId = authUser?.userId || (req.query.userId as string);
      if (!userId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }
      const cards = PaymentService.getUserMaskedCards(userId);
      return sendSuccess(res, cards);
    } catch (err: any) {
      return sendError(res, 'FETCH_CARDS_FAILED', err.message, 500);
    }
  }

  /**
   * POST /api/v1/payments/cards
   * Saves a masked card reference for future payments.
   */
  public static async saveUserCard(req: Request, res: Response) {
    try {
      const authUser = (req as any).user;
      const userId = authUser?.userId || req.body.userId;
      if (!userId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }
      const { brand, last4, expiry, holderName } = req.body;
      if (!last4 || !expiry) {
        return sendError(res, 'INVALID_CARD_DATA', 'last4 and expiry are required.', 400);
      }
      const saved = await PaymentService.saveUserMaskedCard(userId, {
        brand: brand || 'Card',
        last4: String(last4).slice(-4),
        expiry: String(expiry),
        holderName: holderName || authUser?.fullName || 'Cardholder',
      });
      return sendSuccess(res, saved, 201);
    } catch (err: any) {
      return sendError(res, 'SAVE_CARD_FAILED', err.message, 500);
    }
  }

  /**
   * DELETE /api/v1/payments/cards/:cardId
   * Deletes a saved card.
   */
  public static async deleteUserCard(req: Request, res: Response) {
    try {
      const authUser = (req as any).user;
      const userId = authUser?.userId || (req.query.userId as string);
      const { cardId } = req.params;
      if (!userId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }
      await PaymentService.deleteUserMaskedCard(userId, cardId);
      return sendSuccess(res, { message: 'Card removed successfully.' });
    } catch (err: any) {
      return sendError(res, 'DELETE_CARD_FAILED', err.message, 500);
    }
  }
}
