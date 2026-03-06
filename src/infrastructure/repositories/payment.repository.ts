import { Payment, PaymentStatus } from "../../domain/types/payment.types.js";
import { PaymentRepositoryPort } from "../../application/ports/payment.repository.port.js";
import { query } from "../database/pool.js";
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("payment-repository");

const mapRowToPayment = (row: any): Payment => ({
  id: row.id,
  studentId: row.student_id,
  courseId: row.course_id,
  amount: row.amount,
  currency: row.currency,
  status: row.status,
  stripePaymentIntentId: row.stripe_payment_intent_id,
  stripeChargeId: row.stripe_charge_id,
  failureReason: row.failure_reason,
  refundReason: row.refund_reason,
  refundedAmount: row.refunded_amount,
  createdAt: row.created_at,
  completedAt: row.completed_at,
  refundedAt: row.refunded_at,
});

export const createPaymentRepository = (): PaymentRepositoryPort => {
  return {
    findById: async (id: string): Promise<Payment | null> => {
      const result = await query<any>("SELECT * FROM payments WHERE id = $1", [
        id,
      ]);
      return result.rows[0] ? mapRowToPayment(result.rows[0]) : null;
    },

    findByStripePaymentIntent: async (
      stripePaymentIntentId: string
    ): Promise<Payment | null> => {
      const result = await query<any>(
        "SELECT * FROM payments WHERE stripe_payment_intent_id = $1",
        [stripePaymentIntentId]
      );
      return result.rows[0] ? mapRowToPayment(result.rows[0]) : null;
    },

    findByStudent: async (studentId: string): Promise<Payment[]> => {
      const result = await query<any>(
        "SELECT * FROM payments WHERE student_id = $1 ORDER BY created_at DESC",
        [studentId]
      );
      return result.rows.map(mapRowToPayment);
    },

    findByCourse: async (courseId: string): Promise<Payment[]> => {
      const result = await query<any>(
        "SELECT * FROM payments WHERE course_id = $1 ORDER BY created_at DESC",
        [courseId]
      );
      return result.rows.map(mapRowToPayment);
    },

    create: async (
      payment: Omit<Payment, "id" | "createdAt">
    ): Promise<Payment> => {
      // Log payment creation with user ID
      log.info(
        {
          studentId: payment.studentId,
          courseId: payment.courseId,
          amount: payment.amount,
          stripePaymentIntentId: payment.stripePaymentIntentId,
        },
        "Creating payment record with student_id"
      );
      
      const result = await query<any>(
        `INSERT INTO payments (
           student_id, course_id, amount, currency, status,
           stripe_payment_intent_id, stripe_charge_id, failure_reason
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          payment.studentId,
          payment.courseId,
          payment.amount,
          payment.currency,
          payment.status,
          payment.stripePaymentIntentId,
          payment.stripeChargeId || null,
          payment.failureReason || null,
        ]
      );
      
      const createdPayment = mapRowToPayment(result.rows[0]!);
      
      log.info(
        {
          paymentId: createdPayment.id,
          studentId: createdPayment.studentId,
        },
        "Payment record created successfully"
      );
      
      return createdPayment;
    },

    updateStatus: async (
      id: string,
      status: PaymentStatus,
      metadata?: {
        stripeChargeId?: string;
        failureReason?: string;
        completedAt?: Date;
      }
    ): Promise<Payment> => {
      const fields: string[] = [`status = $2`];
      const values: unknown[] = [id, status];
      let paramIndex = 3;

      if (metadata?.stripeChargeId) {
        fields.push(`stripe_charge_id = $${paramIndex++}`);
        values.push(metadata.stripeChargeId);
      }

      if (metadata?.failureReason) {
        fields.push(`failure_reason = $${paramIndex++}`);
        values.push(metadata.failureReason);
      }

      if (metadata?.completedAt) {
        fields.push(`completed_at = $${paramIndex++}`);
        values.push(metadata.completedAt);
      }

      const result = await query<any>(
        `UPDATE payments SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
        values
      );

      return mapRowToPayment(result.rows[0]!);
    },

    recordRefund: async (
      id: string,
      refundedAmount: number,
      refundReason: string
    ): Promise<Payment> => {
      const result = await query<any>(
        `UPDATE payments 
         SET status = 'REFUNDED',
             refunded_amount = $2,
             refund_reason = $3,
             refunded_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, refundedAmount, refundReason]
      );
      return mapRowToPayment(result.rows[0]!);
    },
  };
};
