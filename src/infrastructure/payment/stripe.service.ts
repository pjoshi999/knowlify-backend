import Stripe from "stripe";
import { PaymentGatewayPort } from "../../application/ports/payment-gateway.port.js";
import {
  PaymentIntentResponse,
  StripeWebhookEvent,
} from "../../domain/types/payment.types.js";
import { config } from "../../shared/config.js";

export const createStripeService = (): PaymentGatewayPort => {
  const stripe = new Stripe(config.stripe.secretKey, {
    apiVersion: "2026-02-25.clover",
  });

  return {
    createPaymentIntent: async (
      amount: number,
      currency: string,
      metadata: Record<string, string>
    ): Promise<PaymentIntentResponse> => {
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        metadata,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret!,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      };
    },

    verifyWebhookSignature: (
      payload: string,
      signature: string
    ): StripeWebhookEvent => {
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        config.stripe.webhookSecret
      );

      return event as unknown as StripeWebhookEvent;
    },

    processRefund: async (
      paymentIntentId: string,
      amount?: number,
      reason?: string
    ): Promise<{ id: string; amount: number; status: string }> => {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount,
        reason: reason as Stripe.RefundCreateParams.Reason | undefined,
      });

      return {
        id: refund.id,
        amount: refund.amount,
        status: refund.status ?? "unknown",
      };
    },
  };
};
