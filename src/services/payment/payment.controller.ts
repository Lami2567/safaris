import { Request, Response } from 'express';
import { PaymentService } from './payment.service';
import { sendSuccess, sendError } from '../../shared/response';

export class PaymentController {
  public static async processPayment(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId || req.body.userId;
      const payment = await PaymentService.processPayment({
        ...req.body,
        userId,
      });
      return sendSuccess(res, payment, 201);
    } catch (err: any) {
      return sendError(res, 'PAYMENT_FAILED', err.message, 400);
    }
  }

  public static async verifyPayment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const payment = await PaymentService.verifyPayment(id);
      return sendSuccess(res, payment);
    } catch (err: any) {
      return sendError(res, 'VERIFICATION_FAILED', err.message, 400);
    }
  }

  public static async handleDpoCallback(req: Request, res: Response) {
    try {
      // DPO redirects with TransToken query or body parameter
      const transToken = (req.query.TransToken || req.body?.TransToken || req.query.transToken) as string;
      if (!transToken) {
        return sendError(res, 'MISSING_TOKEN', 'No TransToken provided in callback.', 400);
      }

      const verified = await PaymentService.handleDpoCallback(transToken);
      if (!verified) {
        return sendError(res, 'PAYMENT_NOT_FOUND', 'Could not locate payment matching transaction token.', 404);
      }

      // If requested by a browser redirect, return an HTML bridge or JSON
      if (req.accepts('html')) {
        return res.send(`
          <html>
            <head><title>SAFARIS Payment Complete</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 40px;">
              <h2>Payment ${verified.status}</h2>
              <p>Reference: ${verified.transaction_id}</p>
              <p>Amount: UGX ${verified.amount_ugx?.toLocaleString()}</p>
              <p>You can return to the SAFARIS app now.</p>
            </body>
          </html>
        `);
      }

      return sendSuccess(res, verified);
    } catch (err: any) {
      return sendError(res, 'CALLBACK_FAILED', err.message, 500);
    }
  }

  public static getPaymentByReference(req: Request, res: Response) {
    try {
      const { type, id } = req.params;
      const payment = PaymentService.getPaymentByReference(type as any, id);
      if (!payment) {
        return sendError(res, 'NOT_FOUND', 'No payment record found for this reference.', 404);
      }
      return sendSuccess(res, payment);
    } catch (err: any) {
      return sendError(res, 'FETCH_FAILED', err.message, 500);
    }
  }

  public static getPaymentHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId || req.params.userId;
      const history = PaymentService.getPaymentHistory(userId);
      return sendSuccess(res, history);
    } catch (err: any) {
      return sendError(res, 'PAYMENT_HISTORY_FAILED', err.message, 500);
    }
  }
}
