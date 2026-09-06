import { localStore } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface PaymentInitiationRequest {
  userId: string;
  referenceType: 'TRIP' | 'TOUR' | 'DELIVERY';
  referenceId: string;
  amountUgx: number;
  paymentMethod: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'CARD' | 'CASH';
  phone?: string;
}

export interface PaymentGatewayAdapter {
  processPayment(req: PaymentInitiationRequest): Promise<{ transactionId: string; status: string; message: string }>;
}

export class MockUgandaMobileMoneyAdapter implements PaymentGatewayAdapter {
  public async processPayment(req: PaymentInitiationRequest) {
    // Simulates MTN MoMo Open API or Airtel Money USSD push notification prompt
    const txId = `TX_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    return {
      transactionId: txId,
      status: 'SUCCESSFUL',
      message: `Prompt sent to ${req.phone || 'mobile number'}. Payment of ${req.amountUgx.toLocaleString()} UGX approved.`,
    };
  }
}

export class PaymentService {
  private static adapter: PaymentGatewayAdapter = new MockUgandaMobileMoneyAdapter();

  public static async processPayment(req: PaymentInitiationRequest) {
    const paymentId = `pay_${uuidv4().substring(0, 8)}`;
    
    // Call pluggable adapter
    const result = await this.adapter.processPayment(req);

    const record = {
      id: paymentId,
      transaction_id: result.transactionId,
      user_id: req.userId,
      reference_type: req.referenceType,
      reference_id: req.referenceId,
      amount_ugx: req.amountUgx,
      payment_method: req.paymentMethod,
      phone: req.phone || '',
      status: result.status,
      created_at: new Date().toISOString(),
    };

    localStore.payments.set(paymentId, record);
    return record;
  }

  public static getPaymentHistory(userId: string) {
    return Array.from(localStore.payments.values())
      .filter((p: any) => p.user_id === userId)
      .reverse();
  }
}
