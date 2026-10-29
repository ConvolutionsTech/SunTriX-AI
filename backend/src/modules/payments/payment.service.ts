import crypto from "crypto";
import { paymentRepository, PaymentRepository } from "./payment.repository";
import { taskRequestService, TaskRequestService } from "../task-requests/task-request.service";
import { stripeAdapter, StripeAdapter } from "../../integrations/stripe/stripe.adapter";
import { AppError, ERROR_CODES } from "../../shared/errors/appError";
import { CreateInvoiceDTO, IPayment } from "./payment.types";
import { getSetting } from "../../lib/configLoader";
import { formatMoney } from "../../lib/money";
import TaskRequest from "../../models/TaskRequest";
import { sendPaymentConfirmation, sendInvoiceEmail, sendAdminAlert } from "../../services/email";
import Payment from "../../models/Payment";
import ProjectTracker from "../../models/ProjectTracker";
import WebhookEvent from "../../models/WebhookEvent";
import { logger } from "../../lib/logger";

const INVOICEABLE = ["contract_signed", "in_progress"];
const CHECKOUT_LOCK_MS = 60_000;
// Stripe accepts 30 min – 24 h; a short session limits paying a stale amount
const SESSION_TTL_MS = 31 * 60_000;

export class PaymentService {
  constructor(
    private paymentRepo: PaymentRepository = paymentRepository,
    private taskService: TaskRequestService = taskRequestService,
    private stripe: StripeAdapter = stripeAdapter
  ) {}

  /**
   * The pending Payment for a tracker milestone, created on first request, so
   * milestone checkout gets the same session reuse, locking and webhook path
   * as invoices.
   */
  async milestonePayment(trackerId: string, milestoneId: string): Promise<IPayment> {
    const existing = await Payment.findOne({ trackerId, milestoneId, status: { $in: ["pending", "paid"] } });
    if (existing) return existing;

    const tracker = await ProjectTracker.findById(trackerId);
    const milestone = tracker?.milestones.id(milestoneId);
    if (!tracker || !milestone) throw new AppError("Milestone not found", ERROR_CODES.NOT_FOUND);
    const task = await TaskRequest.findById(tracker.taskRequestId).lean();
    if (!task) throw new AppError("Project request not found", ERROR_CODES.NOT_FOUND);

    return this.paymentRepo.create({
      type: "milestone",
      trackerId,
      milestoneId,
      taskRequestId: tracker.taskRequestId,
      trackingToken: task.trackingToken,
      clientEmail: task.email,
      clientName: task.name,
      description: `${task.projectTitle || "Project"} — ${milestone.title}`,
      amount: milestone.amount,
      currency: "usd",
      invoiceToken: `inv_${crypto.randomBytes(16).toString("hex")}`,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      status: "pending",
    });
  }

  /** Admin bills a signed engagement. Only for requests whose contract is signed. */
  async createInvoice(dto: CreateInvoiceDTO): Promise<{ payment: IPayment; invoiceUrl: string }> {
    const task = await this.taskService.getTaskById(dto.taskRequestId);
    if (!INVOICEABLE.includes(task.status)) {
      throw Object.assign(
        new AppError(`Invoices can only be created once the contract is signed (request is ${task.status}).`, ERROR_CODES.CONFLICT),
        { code: "TASK_NOT_INVOICEABLE" }
      );
    }

    const invoiceToken = `inv_${crypto.randomBytes(16).toString("hex")}`;
    const expiresAt = new Date(Date.now() + (dto.expiresInDays || 14) * 86400000);
    const clientEmail = dto.clientEmail || task.email;
    const clientName = dto.clientName || task.name;

    const payment = await this.paymentRepo.create({
      taskRequestId: dto.taskRequestId,
      trackingToken: task.trackingToken,
      clientEmail,
      clientName,
      description: dto.description,
      amount: dto.amountCents,
      currency: dto.currency || "usd",
      type: "invoice",
      invoiceToken,
      expiresAt,
      status: "pending",
    });

    const appUrl = getSetting("FRONTEND_URL", "http://localhost:5173");
    const invoiceUrl = `${appUrl}/invoice/${invoiceToken}`;

    await sendInvoiceEmail({
      clientEmail,
      clientName: clientName || "Valued Client",
      description: dto.description,
      amountUSD: formatMoney(dto.amountCents, payment.currency),
      invoiceUrl,
      expiresAt: expiresAt.toISOString(),
    });

    return { payment, invoiceUrl };
  }

  async getInvoiceByToken(invoiceToken: string): Promise<IPayment> {
    const payment = await this.paymentRepo.findByInvoiceToken(invoiceToken);
    if (!payment) throw new AppError("Invoice not found", ERROR_CODES.NOT_FOUND);
    return payment;
  }

  /**
   * Returns a Stripe Checkout URL for a pending invoice. An open session is
   * reused (a second tab gets the same session, not a second charge); a new one
   * is created under a short lock with an idempotency key, and the old one expired.
   */
  async processInvoiceCheckout(invoiceToken: string): Promise<string> {
    const payment = await this.getInvoiceByToken(invoiceToken);
    if (payment.status === "paid") throw new AppError("This invoice has already been paid.", ERROR_CODES.CONFLICT);
    if (payment.status !== "pending") throw new AppError(`This invoice is ${payment.status} and can't be paid.`, ERROR_CODES.CONFLICT);
    if (payment.expiresAt && new Date() > payment.expiresAt) throw new AppError("This invoice has expired.", 410);

    const now = Date.now();
    if (payment.stripeSessionId && payment.sessionExpiresAt && payment.sessionExpiresAt.getTime() > now + 60_000) {
      const open = await this.stripe.retrieveCheckoutSession(payment.stripeSessionId).catch(() => null);
      if (open?.status === "open" && open.url) return open.url;
    }

    const lockedAt = new Date(now);
    const locked = await this.paymentRepo.acquireCheckoutLock(invoiceToken, lockedAt, CHECKOUT_LOCK_MS);
    if (!locked) throw new AppError("Checkout is already being prepared — please try again in a moment.", ERROR_CODES.CONFLICT);

    try {
      // Re-check under the lock: another request may have just stored an open session
      if (locked.stripeSessionId && locked.sessionExpiresAt && locked.sessionExpiresAt.getTime() > now + 60_000) {
        const open = await this.stripe.retrieveCheckoutSession(locked.stripeSessionId).catch(() => null);
        if (open?.status === "open" && open.url) {
          await this.paymentRepo.releaseCheckoutLock(locked._id);
          return open.url;
        }
      }
      if (locked.stripeSessionId) await this.stripe.expireCheckoutSession(locked.stripeSessionId);

      const appUrl = getSetting("FRONTEND_URL", "http://localhost:5173");
      const sessionExpiresAt = new Date(now + SESSION_TTL_MS);
      // Milestone payments return to the client's project hub; invoices to the success page
      const tracker = locked.type === "milestone" && locked.trackerId ? await ProjectTracker.findById(locked.trackerId).select("trackerToken").lean() : null;
      const successUrl = tracker
        ? `${appUrl}/client/project/${tracker.trackerToken}?paid=1`
        : `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&invoiceToken=${locked.invoiceToken}`;
      const cancelUrl = tracker ? `${appUrl}/client/project/${tracker.trackerToken}` : `${appUrl}/invoice/${locked.invoiceToken}?canceled=true`;
      const session = await this.stripe.createCheckoutSession({
        clientEmail: locked.clientEmail,
        description: locked.description,
        amountCents: locked.amount,
        currency: locked.currency || "usd",
        metadata: {
          invoiceToken: locked.invoiceToken || "",
          taskRequestId: locked.taskRequestId ? locked.taskRequestId.toString() : "",
          paymentType: locked.type,
        },
        successUrl,
        cancelUrl,
        expiresAt: sessionExpiresAt,
        clientReferenceId: locked.invoiceToken,
        idempotencyKey: `${locked.invoiceToken}:${lockedAt.getTime()}`,
      });
      if (!session.url) throw new AppError("Failed to create Stripe checkout session", ERROR_CODES.INTERNAL_SERVER_ERROR);

      await this.paymentRepo.storeCheckoutSession(locked._id, session.id, sessionExpiresAt);
      return session.url;
    } catch (err) {
      await this.paymentRepo.releaseCheckoutLock(locked._id);
      throw err;
    }
  }

  /**
   * Post-payment work, safe to run more than once: starts the project (invoice)
   * or marks the tracker milestone paid (milestone), emails the client, then
   * records completion. Throws on failure so the webhook / reconciler retries.
   */
  async runPaidSideEffects(payment: IPayment): Promise<void> {
    if (payment.sideEffectsDone) return;
    const appUrl = getSetting("FRONTEND_URL", "http://localhost:5173");
    let trackingUrl = payment.trackingToken ? `${appUrl}/track/${payment.trackingToken}` : "";

    if (payment.type === "milestone" && payment.trackerId && payment.milestoneId) {
      const tracker = await ProjectTracker.findOneAndUpdate(
        { _id: payment.trackerId, milestones: { $elemMatch: { _id: payment.milestoneId, paidAt: null } } },
        {
          $set: {
            "milestones.$.paidAt": payment.paidAt || new Date(),
            "milestones.$.stripePaymentIntentId": payment.stripePaymentIntentId,
            "milestones.$.invoiceId": payment._id,
          },
        },
        { new: true }
      );
      const current = tracker ?? (await ProjectTracker.findById(payment.trackerId));
      if (current) trackingUrl = `${appUrl}/client/project/${current.trackerToken}`;
    } else if (payment.taskRequestId) {
      const taskId = payment.taskRequestId.toString();
      const task = await TaskRequest.findById(taskId);
      if (task?.status === "contract_signed") {
        await this.taskService.transitionStatus(taskId, "in_progress", "system", `Paid invoice: ${payment.description}`);
      } else if (task && !["in_progress", "completed"].includes(task.status)) {
        // e.g. paid after the engagement was cancelled — needs a human
        await sendAdminAlert({
          subject: "Payment received for an inactive engagement",
          message: `${formatMoney(payment.amount, payment.currency)} from ${payment.clientEmail} for "${payment.description}" was paid while the request is "${task.status}". Review and refund if needed.`,
          adminUrl: `${appUrl}/admin/payments`,
        });
      }
    }

    await sendPaymentConfirmation({
      clientName: payment.clientName || "Valued Client",
      clientEmail: payment.clientEmail,
      description: payment.description,
      amountUSD: formatMoney(payment.amount, payment.currency),
      receiptUrl: payment.receiptUrl || "",
      trackingUrl,
      paidAt: (payment.paidAt || new Date()).toISOString(),
    });

    await this.paymentRepo.markSideEffectsDone(payment._id);
  }

  /**
   * Stripe webhook. Each event id is recorded first; an event already processed
   * is acknowledged without doing anything again. Errors after verification
   * propagate (→ 500) so Stripe retries the event.
   */
  async handleStripeWebhookEvent(rawBody: string | Buffer, signature: string): Promise<{ received: boolean; eventType: string; duplicate?: boolean }> {
    const event = await this.stripe.constructWebhookEvent(rawBody, signature);

    const seen = await WebhookEvent.findOneAndUpdate(
      { _id: event.id },
      { $setOnInsert: { type: event.type, receivedAt: new Date() } },
      { upsert: true, new: false }
    );
    if (seen?.processedAt) return { received: true, eventType: event.type, duplicate: true };

    try {
      await this.applyEvent(event);
      await WebhookEvent.updateOne({ _id: event.id }, { $set: { processedAt: new Date() }, $unset: { error: 1 } });
    } catch (err) {
      await WebhookEvent.updateOne({ _id: event.id }, { $set: { error: (err as Error).message } }).catch(() => {});
      throw err;
    }
    return { received: true, eventType: event.type };
  }

  private async applyEvent(event: { type: string; data: { object: any } }): Promise<void> {
    const obj = event.data.object;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        if (obj.payment_status !== "paid") return; // e.g. bank debit still processing
        const paymentIntentId = typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id || "";
        const receiptUrl = await this.stripe.getReceiptUrl(paymentIntentId).catch(() => "");
        const claimed = await this.paymentRepo.claimPaid(obj.id, obj.metadata?.invoiceToken, { stripePaymentIntentId: paymentIntentId, receiptUrl });
        const payment = claimed ?? (await this.paymentRepo.findForSession(obj.id, obj.metadata?.invoiceToken));
        if (payment?.status === "paid") await this.runPaidSideEffects(payment);
        return;
      }
      case "checkout.session.expired":
        // The invoice stays payable; the next checkout creates a fresh session
        await Payment.updateOne({ stripeSessionId: obj.id, status: "pending" }, { $unset: { stripeSessionId: 1, sessionExpiresAt: 1 } });
        return;
      case "charge.refunded":
        if (obj.payment_intent) {
          await Payment.updateOne(
            { stripePaymentIntentId: obj.payment_intent },
            { $set: { status: "refunded", refundedAt: new Date(), refundId: obj.refunds?.data?.[0]?.id || "" } }
          );
        }
        return;
      case "charge.dispute.created": {
        const payment = obj.payment_intent
          ? await Payment.findOneAndUpdate({ stripePaymentIntentId: obj.payment_intent }, { $set: { disputed: true } }, { new: true })
          : null;
        await sendAdminAlert({
          subject: "Payment disputed",
          message: `A ${formatMoney(obj.amount || 0, obj.currency || "usd")} payment${payment ? ` from ${payment.clientEmail} ("${payment.description}")` : ""} was disputed. Reason: ${obj.reason || "not given"}. Respond in the Stripe dashboard before the deadline.`,
        });
        return;
      }
      default:
        return; // other event types are acknowledged and ignored
    }
  }

  /**
   * Issues a Stripe refund. The payment flips to "refunded" when Stripe sends
   * charge.refunded (handled in applyEvent).
   */
  async refund(paymentId: string, amountCents: number | undefined, reason: string): Promise<IPayment> {
    const payment = await Payment.findById(paymentId);
    if (!payment) throw new AppError("Payment not found", ERROR_CODES.NOT_FOUND);
    if (payment.status !== "paid") throw new AppError(`A ${payment.status} payment can't be refunded.`, ERROR_CODES.CONFLICT);
    if (!payment.stripePaymentIntentId) throw new AppError("This payment wasn't made through Stripe — refund it the way it was paid.", ERROR_CODES.CONFLICT);
    if (amountCents && amountCents > payment.amount) throw new AppError("Refund can't exceed the amount paid.", ERROR_CODES.BAD_REQUEST);

    const refund = await this.stripe.createRefund(payment.stripePaymentIntentId, amountCents, reason);
    payment.refundId = refund.id;
    payment.refundReason = reason;
    await payment.save();
    return payment;
  }

  /** Retries post-payment work that didn't finish (called by the scheduler). */
  async reconcilePaidPayments(olderThanMs = 2 * 60_000): Promise<number> {
    const stuck = await this.paymentRepo.findPendingSideEffects(new Date(Date.now() - olderThanMs));
    let done = 0;
    for (const payment of stuck) {
      try {
        await this.runPaidSideEffects(payment);
        done++;
      } catch (err) {
        logger.error({ err, paymentId: String(payment._id) }, "Post-payment side effects still failing");
      }
    }
    return done;
  }
}

export const paymentService = new PaymentService();
