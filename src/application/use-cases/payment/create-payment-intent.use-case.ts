import { PaymentGatewayPort } from "../../ports/payment-gateway.port.js";
import { PaymentRepositoryPort } from "../../ports/payment.repository.port.js";
import { CourseRepositoryPort } from "../../ports/course.repository.port.js";
import {
  PaymentIntentResponse,
  CreatePaymentIntentInput,
} from "../../../domain/types/payment.types.js";
import { NotFoundError } from "../../../domain/errors/domain.errors.js";

export type CreatePaymentIntentUseCase = (
  input: CreatePaymentIntentInput
) => Promise<PaymentIntentResponse>;

export const createCreatePaymentIntentUseCase = (
  paymentGateway: PaymentGatewayPort,
  paymentRepository: PaymentRepositoryPort,
  courseRepository: CourseRepositoryPort
): CreatePaymentIntentUseCase => {
  return async (
    input: CreatePaymentIntentInput
  ): Promise<PaymentIntentResponse> => {
    const course = await courseRepository.findById(input.courseId);
    if (!course) {
      throw new NotFoundError("Course not found");
    }

    const amountInCents = Math.round(input.amount ?? course.priceAmount);

    const paymentIntent = await paymentGateway.createPaymentIntent(
      amountInCents,
      input.currency ?? "USD",
      {
        studentId: input.studentId,
        courseId: input.courseId,
        courseName: course.name,
      }
    );

    // Create payment record
    await paymentRepository.create({
      studentId: input.studentId,
      courseId: input.courseId,
      amount: amountInCents,
      currency: input.currency ?? "USD",
      status: "PENDING",
      stripePaymentIntentId: paymentIntent.paymentIntentId,
    });

    return paymentIntent;
  };
};
