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

  async claimPaymentPaid(
    invoiceToken?: string,
    stripeSessionId?: string,
    updateData: Record<string, any> = {}
  ): Promise<{ payment: IPayment | null; wasAlreadyPaid: boolean }> {
    let existing: IPayment | null = null;
    if (invoiceToken) existing = await Payment.findOne({ invoiceToken });
    if (!existing && stripeSessionId) existing = await Payment.findOne({ stripeSessionId });

    if (existing && existing.paidAt) {
      return { payment: existing, wasAlreadyPaid: true };
    }

    const filter = invoiceToken
      ? { invoiceToken, paidAt: null }
      : { stripeSessionId, paidAt: null };

    const updated = await Payment.findOneAndUpdate(
      filter,
      { $set: { ...updateData, status: "paid", paidAt: new Date() } },
      { new: true }
    );

    return { payment: updated, wasAlreadyPaid: false };
  }
}

export const paymentRepository = new PaymentRepository();
