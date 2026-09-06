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
