import { Payment, PaymentStatus } from "../../domain/types/payment.types.js";

export interface PaymentRepositoryPort {
  findById: (id: string) => Promise<Payment | null>;
  findByStripePaymentIntent: (
    stripePaymentIntentId: string
  ) => Promise<Payment | null>;
  findByStudent: (studentId: string) => Promise<Payment[]>;
  findByCourse: (courseId: string) => Promise<Payment[]>;
  create: (payment: Omit<Payment, "id" | "createdAt">) => Promise<Payment>;
  updateStatus: (
    id: string,
    status: PaymentStatus,
    metadata?: {
      stripeChargeId?: string;
      failureReason?: string;
      completedAt?: Date;
    }
  ) => Promise<Payment>;
  recordRefund: (
    id: string,
    refundedAmount: number,
    refundReason: string
  ) => Promise<Payment>;
}
