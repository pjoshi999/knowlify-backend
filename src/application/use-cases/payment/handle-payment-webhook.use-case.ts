import { PaymentRepositoryPort } from "../../ports/payment.repository.port.js";
import { EnrollmentRepositoryPort } from "../../ports/enrollment.repository.port.js";
import { StripeWebhookEvent } from "../../../domain/types/payment.types.js";
import { createModuleLogger } from "../../../shared/logger.js";
import { transaction } from "../../../infrastructure/database/pool.js";

const log = createModuleLogger("payment-webhook");

export type HandlePaymentWebhookUseCase = (
  event: StripeWebhookEvent
) => Promise<void>;

export const createHandlePaymentWebhookUseCase = (
  paymentRepository: PaymentRepositoryPort,
  _enrollmentRepository: EnrollmentRepositoryPort
): HandlePaymentWebhookUseCase => {
  return async (event: StripeWebhookEvent): Promise<void> => {
    const { type, data } = event;

    switch (type) {
      case "payment_intent.succeeded": {
        const paymentIntentId = data.object.id;

        // Find payment record
        const payment =
          await paymentRepository.findByStripePaymentIntent(paymentIntentId);

        if (!payment) {
          log.warn(
            { paymentIntentId },
            "Payment not found for intent - may be a test event"
          );
          return; // Don't throw error for test events
        }

        // Use transaction to ensure atomicity of payment update and enrollment creation
        try {
          await transaction(async (client) => {
            // Update payment status
            await client.query(
              `UPDATE payments 
               SET status = $1, stripe_charge_id = $2, completed_at = $3, updated_at = NOW()
               WHERE id = $4`,
              ["COMPLETED", data.object.id, new Date(), payment.id]
            );

            // Create enrollment
            await client.query(
              `INSERT INTO enrollments (student_id, course_id, payment_id, progress)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (student_id, course_id) DO NOTHING`,
              [
                payment.studentId,
                payment.courseId,
                payment.id,
                JSON.stringify({
                  completedLessons: [],
                  watchedVideos: {},
                }),
              ]
            );
          });

          log.info(
            { studentId: payment.studentId, courseId: payment.courseId },
            "Payment completed and enrollment created successfully"
          );
        } catch (error) {
          log.error(
            { err: error, paymentId: payment.id },
            "Failed to process payment and create enrollment - transaction rolled back"
          );
          throw error;
        }

        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntentId = data.object.id;

        const payment =
          await paymentRepository.findByStripePaymentIntent(paymentIntentId);

        if (payment) {
          await paymentRepository.updateStatus(payment.id, "FAILED", {
            failureReason: "Payment failed",
          });
        } else {
          log.warn({ paymentIntentId }, "Payment not found for failed intent");
        }

        break;
      }

      // Informational events - no action needed
      case "payment_intent.created":
      case "payment_intent.requires_action":
      case "charge.succeeded":
      case "charge.updated":
      case "mandate.updated":
        log.debug({ type }, "Received informational webhook event");
        break;

      default:
        log.warn({ type }, "Unhandled webhook event type");
    }
  };
};
