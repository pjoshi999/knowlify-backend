export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";

export interface Payment {
  id: string;
  studentId: string;
  courseId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  stripePaymentIntentId: string;
  stripeChargeId?: string;
  failureReason?: string;
  refundReason?: string;
  refundedAmount?: number;
  createdAt: Date;
  completedAt?: Date;
  refundedAt?: Date;
}

export interface CreatePaymentIntentInput {
  studentId: string;
  courseId: string;
  amount: number;
  currency?: string;
}

export interface PaymentIntentResponse {
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
}

export interface ProcessRefundInput {
  paymentId: string;
  reason: string;
  amount?: number;
}

export interface StripeWebhookEvent {
  type: string;
  data: {
    object: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      metadata?: Record<string, string>;
      [key: string]: unknown;
    };
  };
}
