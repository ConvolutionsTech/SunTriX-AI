import Stripe from "stripe";
import { getSetting } from "../../lib/configLoader";
import { AppError, ERROR_CODES } from "../../shared/errors/appError";

const STRIPE_API_VERSION = "2025-02-24.acacia";

export class StripeAdapter {
  getClient(): InstanceType<typeof Stripe> {
    const secretKey = getSetting("STRIPE_SECRET_KEY");
    if (!secretKey) {
      throw new AppError("Stripe is not configured (STRIPE_SECRET_KEY missing)", ERROR_CODES.INTERNAL_SERVER_ERROR);
    }
    // Pinned on purpose: the SDK (v22) defaults to a newer API version, and moving
    // to it is a behaviour change to test against Stripe first (see PlatformDocumentation §11.1).
    return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION as NonNullable<ConstructorParameters<typeof Stripe>[1]>["apiVersion"] });
  }

  async constructWebhookEvent(payload: string | Buffer, signature: string): Promise<any> {
    // stripe-node accepts events signed with an empty secret, so an unset secret
    // would let anyone forge events. Fail closed instead.
    const webhookSecret = getSetting("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret || !webhookSecret.startsWith("whsec_")) {
      throw new AppError("Stripe webhook secret is not configured", ERROR_CODES.INTERNAL_SERVER_ERROR);
    }
    try {
      return this.getClient().webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      // Bad/forged signature or malformed payload: reject (Stripe won't retry a 400)
      throw new AppError(`Webhook signature verification failed: ${(err as Error).message}`, ERROR_CODES.BAD_REQUEST);
    }
  }

  /** Receipt link of the charge behind a PaymentIntent ("" if unavailable). */
  async getReceiptUrl(paymentIntentId: string): Promise<string> {
    if (!paymentIntentId) return "";
    const intent = await this.getClient().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    const charge = intent.latest_charge as { receipt_url?: string | null } | null;
    return charge?.receipt_url || "";
  }

  async createCheckoutSession(params: {
    clientEmail: string;
    description: string;
    amountCents: number;
    currency?: string;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
    /** Session lifetime (Stripe accepts 30 min – 24 h from now) */
    expiresAt?: Date;
    clientReferenceId?: string;
    /** Same key → Stripe returns the same session instead of creating another */
    idempotencyKey?: string;
  }): Promise<{ id: string; url: string | null }> {
    const client = this.getClient();
    const session = await client.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: (params.currency || "USD").toLowerCase(),
            product_data: { name: params.description },
            unit_amount: params.amountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: params.clientEmail,
      metadata: params.metadata,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      ...(params.expiresAt && { expires_at: Math.floor(params.expiresAt.getTime() / 1000) }),
      ...(params.clientReferenceId && { client_reference_id: params.clientReferenceId }),
    }, params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined);

    return { id: session.id, url: session.url };
  }

  async retrieveCheckoutSession(id: string): Promise<{ id: string; url: string | null; status: string | null }> {
    const session = await this.getClient().checkout.sessions.retrieve(id);
    return { id: session.id, url: session.url, status: session.status };
  }

  /** Expires an open session so it can no longer be paid (ignored if already complete/expired). */
  async expireCheckoutSession(id: string): Promise<void> {
    await this.getClient().checkout.sessions.expire(id).catch(() => {});
  }

  async createRefund(paymentIntentId: string, amountCents?: number, reason?: string): Promise<any> {
    const client = this.getClient();
    return client.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountCents,
      reason: reason as any,
    });
  }
}

export const stripeAdapter = new StripeAdapter();
