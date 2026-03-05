import { PaymentRepositoryPort } from "../../ports/payment.repository.port.js";
import { EnrollmentRepositoryPort } from "../../ports/enrollment.repository.port.js";
import { StripeWebhookEvent } from "../../../domain/types/payment.types.js";
import { createModuleLogger } from "../../../shared/logger.js";

const log = createModuleLogger("payment-webhook");

export type HandlePaymentWebhookUseCase = (
  event: StripeWebhookEvent
) => Promise<void>;

export const createHandlePaymentWebhookUseCase = (
  paymentRepository: PaymentRepositoryPort,
  enrollmentRepository: EnrollmentRepositoryPort
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

        // Update payment status
        await paymentRepository.updateStatus(payment.id, "COMPLETED", {
          stripeChargeId: data.object.id,
          completedAt: new Date(),
        });

        // Create enrollment
        await enrollmentRepository.create({
          studentId: payment.studentId,
          courseId: payment.courseId,
          paymentId: payment.id,
        });

        log.info(
          { studentId: payment.studentId, courseId: payment.courseId },
          "Enrollment created successfully"
        );

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

      default:
        log.warn({ type }, "Unhandled webhook event type");
    }
  };
};
