import {
  PaymentIntentResponse,
  StripeWebhookEvent,
} from "../../domain/types/payment.types.js";

export interface PaymentGatewayPort {
  createPaymentIntent: (
    amount: number,
    currency: string,
    metadata: Record<string, string>
  ) => Promise<PaymentIntentResponse>;
  verifyWebhookSignature: (
    payload: string,
    signature: string
  ) => StripeWebhookEvent;
  processRefund: (
    paymentIntentId: string,
    amount?: number,
    reason?: string
  ) => Promise<{ id: string; amount: number; status: string }>;
}
