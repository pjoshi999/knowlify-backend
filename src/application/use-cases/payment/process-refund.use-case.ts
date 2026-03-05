import { PaymentGatewayPort } from "../../ports/payment-gateway.port.js";
import { PaymentRepositoryPort } from "../../ports/payment.repository.port.js";
import { ProcessRefundInput } from "../../../domain/types/payment.types.js";
import {
  NotFoundError,
  ConflictError,
} from "../../../domain/errors/domain.errors.js";

export type ProcessRefundUseCase = (input: ProcessRefundInput) => Promise<void>;

export const createProcessRefundUseCase = (
  paymentGateway: PaymentGatewayPort,
  paymentRepository: PaymentRepositoryPort
): ProcessRefundUseCase => {
  return async (input: ProcessRefundInput): Promise<void> => {
    // Find payment
    const payment = await paymentRepository.findById(input.paymentId);

    if (!payment) {
      throw new NotFoundError("Payment not found");
    }

    if (payment.status !== "COMPLETED") {
      throw new ConflictError("Can only refund completed payments");
    }

    if (payment.refundedAt) {
      throw new ConflictError("Payment already refunded");
    }

    // Process refund with Stripe
    const refund = await paymentGateway.processRefund(
      payment.stripePaymentIntentId,
      input.amount,
      input.reason
    );

    // Update payment record
    await paymentRepository.recordRefund(
      payment.id,
      refund.amount,
      input.reason
    );
  };
};
