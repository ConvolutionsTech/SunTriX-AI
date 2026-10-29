import crypto from "crypto";
import { paymentRepository, PaymentRepository } from "./payment.repository";
import { taskRequestService, TaskRequestService } from "../task-requests/task-request.service";
import { stripeAdapter, StripeAdapter } from "../../integrations/stripe/stripe.adapter";
import { AppError, ERROR_CODES } from "../../shared/errors/appError";
import { CreateInvoiceDTO, IPayment } from "./payment.types";
import { getSetting } from "../../lib/configLoader";
import { formatMoney } from "../../lib/money";
import TaskRequest from "../../models/TaskRequest";
import { sendPaymentConfirmation, sendInvoiceEmail } from "../../services/email";

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
        successUrl: `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&invoiceToken=${locked.invoiceToken}`,
        cancelUrl: `${appUrl}/invoice/${locked.invoiceToken}?canceled=true`,
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

  async handlePaymentPaidSideEffects(payment: IPayment): Promise<void> {
    if (payment.taskRequestId) {
      const taskReqId = payment.taskRequestId.toString();
      const task = await TaskRequest.findById(taskReqId);
      if (task && (payment.type === "invoice" || payment.type === "subscription")) {
        if (task.status === "contract_signed" || task.status === "contract_sent") {
          await this.taskService.transitionStatus(taskReqId, "in_progress", "system", `Paid invoice: ${payment.description}`);
        }
      }
    }

    sendPaymentConfirmation({
      clientName: payment.clientName || "Valued Client",
      clientEmail: payment.clientEmail,
      description: payment.description,
      amountUSD: `$${(payment.amount / 100).toFixed(2)}`,
      receiptUrl: (payment as any).stripeReceiptUrl || "",
      paidAt: new Date().toISOString(),
    }).catch(console.error);
  }

  async handleStripeWebhookEvent(rawBody: string | Buffer, signature: string): Promise<{ received: boolean; eventType: string }> {
    const event = await this.stripe.constructWebhookEvent(rawBody, signature);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const invoiceToken = session.metadata?.invoiceToken;
      const stripeSessionId = session.id;

      const { payment, wasAlreadyPaid } = await this.paymentRepo.claimPaymentPaid(invoiceToken, stripeSessionId, {
        stripePaymentIntentId: session.payment_intent as string,
        stripeReceiptUrl: session.payment_intent?.charges?.data[0]?.receipt_url || "",
      });

      if (payment && !wasAlreadyPaid) {
        await this.handlePaymentPaidSideEffects(payment);
      }
    }

    return { received: true, eventType: event.type };
  }
}

export const paymentService = new PaymentService();
