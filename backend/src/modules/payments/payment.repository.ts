import Payment, { IPayment } from "../../models/Payment";

export class PaymentRepository {
  async create(data: any): Promise<IPayment> {
    return Payment.create(data);
  }

  async findByInvoiceToken(invoiceToken: string): Promise<IPayment | null> {
    return Payment.findOne({ invoiceToken });
  }

  /** Takes the checkout lock for a pending invoice (or a lock older than `staleMs`). */
  async acquireCheckoutLock(invoiceToken: string, at: Date, staleMs: number): Promise<IPayment | null> {
    return Payment.findOneAndUpdate(
      {
        invoiceToken,
        status: "pending",
        $or: [{ checkoutLock: null }, { checkoutLock: { $lt: new Date(at.getTime() - staleMs) } }],
      },
      { $set: { checkoutLock: at } },
      { new: true }
    );
  }

  async storeCheckoutSession(id: unknown, stripeSessionId: string, sessionExpiresAt: Date): Promise<void> {
    await Payment.updateOne({ _id: id }, { $set: { stripeSessionId, sessionExpiresAt, checkoutLock: null } });
  }

  async releaseCheckoutLock(id: unknown): Promise<void> {
    await Payment.updateOne({ _id: id }, { $set: { checkoutLock: null } });
  }

  async findByStripeSessionId(stripeSessionId: string): Promise<IPayment | null> {
    return Payment.findOne({ stripeSessionId });
  }

  /** Marks a pending payment paid (by Checkout session, or invoice token as a fallback). Null if not pending. */
  async claimPaid(stripeSessionId: string, invoiceToken: string | undefined, set: Record<string, unknown>): Promise<IPayment | null> {
    const or: Record<string, unknown>[] = [{ stripeSessionId }];
    if (invoiceToken) or.push({ invoiceToken });
    return Payment.findOneAndUpdate(
      { $or: or, status: "pending" },
      { $set: { ...set, status: "paid", paidAt: new Date() } },
      { new: true }
    );
  }

  async findForSession(stripeSessionId: string, invoiceToken?: string): Promise<IPayment | null> {
    const or: Record<string, unknown>[] = [{ stripeSessionId }];
    if (invoiceToken) or.push({ invoiceToken });
    return Payment.findOne({ $or: or });
  }

  async markSideEffectsDone(id: unknown): Promise<void> {
    await Payment.updateOne({ _id: id }, { $set: { sideEffectsDone: true } });
  }

  async findPendingSideEffects(olderThan: Date, limit = 50): Promise<IPayment[]> {
    return Payment.find({ status: "paid", sideEffectsDone: false, paidAt: { $lt: olderThan } }).limit(limit);
  }
}

export const paymentRepository = new PaymentRepository();
