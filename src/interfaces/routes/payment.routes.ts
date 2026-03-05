import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import { PaymentGatewayPort } from "../../application/ports/payment-gateway.port.js";
import { PaymentRepositoryPort } from "../../application/ports/payment.repository.port.js";
import { EnrollmentRepositoryPort } from "../../application/ports/enrollment.repository.port.js";
import { CourseRepositoryPort } from "../../application/ports/course.repository.port.js";
import { createCreatePaymentIntentUseCase } from "../../application/use-cases/payment/create-payment-intent.use-case.js";
import { createHandlePaymentWebhookUseCase } from "../../application/use-cases/payment/handle-payment-webhook.use-case.js";
import { createProcessRefundUseCase } from "../../application/use-cases/payment/process-refund.use-case.js";
import {
  CreatePaymentIntentInput,
  ProcessRefundInput,
} from "../../domain/types/payment.types.js";
import { createModuleLogger } from "../../shared/logger.js";
import { NotFoundError } from "../../domain/errors/domain.errors.js";
import { sendMessage, sendSuccess } from "../utils/response.js";

const log = createModuleLogger("payment");

interface PaymentRoutesConfig {
  paymentGateway: PaymentGatewayPort;
  paymentRepository: PaymentRepositoryPort;
  enrollmentRepository: EnrollmentRepositoryPort;
  courseRepository: CourseRepositoryPort;
  authenticate: RequestHandler;
}

export const createPaymentRoutes = ({
  paymentGateway,
  paymentRepository,
  enrollmentRepository,
  courseRepository,
  authenticate,
}: PaymentRoutesConfig): Router => {
  const router = Router();

  const createPaymentIntent = createCreatePaymentIntentUseCase(
    paymentGateway,
    paymentRepository,
    courseRepository
  );

  const handlePaymentWebhook = createHandlePaymentWebhookUseCase(
    paymentRepository,
    enrollmentRepository
  );

  const processRefund = createProcessRefundUseCase(
    paymentGateway,
    paymentRepository
  );

  // Create payment intent
  router.post(
    "/intent",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { courseId, amount, currency } = req.body as Pick<
          CreatePaymentIntentInput,
          "courseId" | "amount" | "currency"
        >;
        const input: CreatePaymentIntentInput = {
          courseId,
          amount,
          currency,
          studentId: req.user!.id,
        };
        const paymentIntent = await createPaymentIntent(input);
        sendSuccess(res, paymentIntent, 201);
      } catch (error) {
        next(error);
      }
    }
  );

  // Stripe webhook handler
  router.post(
    "/webhook",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const signature = req.headers["stripe-signature"] as string;

        if (!signature) {
          throw new Error("Missing stripe-signature header");
        }

        // req.body is a Buffer when using express.raw()
        const payload = (req.body as Buffer).toString("utf8");

        // Verify webhook signature
        const event = paymentGateway.verifyWebhookSignature(payload, signature);

        // Handle webhook event
        await handlePaymentWebhook(event);

        sendSuccess(res, { received: true });
      } catch (error) {
        log.error({ err: error }, "Webhook error");
        next(error);
      }
    }
  );

  // Get payment by ID (supports both UUID and Stripe payment intent ID)
  router.get(
    "/:id",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = req.params["id"] as string;

        // Check if it's a Stripe payment intent ID (starts with pi_)
        let payment;
        if (id.startsWith("pi_")) {
          payment = await paymentRepository.findByStripePaymentIntent(id);
        } else {
          payment = await paymentRepository.findById(id);
        }

        sendSuccess(res, payment);
      } catch (error) {
        next(error);
      }
    }
  );

  // Process refund (supports both UUID and Stripe payment intent ID)
  router.post(
    "/:id/refund",
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const id = req.params["id"] as string;

        // Check if it's a Stripe payment intent ID (starts with pi_)
        let paymentId = id;
        if (id.startsWith("pi_")) {
          const payment = await paymentRepository.findByStripePaymentIntent(id);
          if (!payment) {
            throw new NotFoundError("Payment");
          }
          paymentId = payment.id;
        }

        const { reason, amount } = req.body as Pick<
          ProcessRefundInput,
          "reason" | "amount"
        >;
        const input: ProcessRefundInput = {
          paymentId,
          reason,
          amount,
        };
        await processRefund(input);
        sendMessage(res, "Refund processed successfully");
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};
