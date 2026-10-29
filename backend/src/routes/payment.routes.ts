import { Router, Request, Response, NextFunction } from "express";
import { paymentService } from "../modules/payments/payment.service";
import { requireAuth } from "../middleware/auth";
import { validate, InvoiceCreateSchema } from "../middleware/validate";
import { logAudit } from "../lib/audit";
import { AppError } from "../shared/errors/appError";
import Payment from "../models/Payment";
import TaskRequest from "../models/TaskRequest";
import { toClientInvoice } from "../lib/clientDto";

const router = Router();

// GET /payments/invoice/:token — PUBLIC client views invoice
router.get("/invoice/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await paymentService.getInvoiceByToken(req.params.token);
    const task = payment.taskRequestId ? await TaskRequest.findById(payment.taskRequestId).select("projectTitle service").lean() : null;
    res.json(toClientInvoice(payment, task));
  } catch (err) {
    next(err);
  }
});

// POST /payments/invoice/:token/checkout — PUBLIC client initiates Stripe checkout for invoice
router.post("/invoice/:token/checkout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const checkoutUrl = await paymentService.processInvoiceCheckout(req.params.token);
    res.json({ checkoutUrl });
  } catch (err) {
    next(err);
  }
});

// GET /payments/admin/list — newest first (capped)
router.get("/admin/list", requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 }).limit(500).lean();
    res.json({ payments });
  } catch (err) {
    next(err);
  }
});

// GET /payments/admin/stats — totals in cents
router.get("/admin/stats", requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [paid, refunded, month, pendingCount] = await Promise.all([
      Payment.aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Payment.aggregate([{ $match: { status: "refunded" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Payment.aggregate([{ $match: { status: "paid", paidAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Payment.countDocuments({ status: "pending" }),
    ]);
    res.json({
      totalRevenueCents: paid[0]?.total ?? 0,
      refundedCents: refunded[0]?.total ?? 0,
      thisMonthCents: month[0]?.total ?? 0,
      pendingCount,
    });
  } catch (err) {
    next(err);
  }
});

// POST /payments/admin/invoice — ADMIN creates invoice
router.post("/admin/invoice", requireAuth, validate(InvoiceCreateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await paymentService.createInvoice(req.body);
    await logAudit(req, "create", "payment", result.payment._id.toString(), result.payment.description);
    res.status(201).json({
      message: "Invoice created and sent to client via email",
      payment: result.payment,
      invoiceUrl: result.invoiceUrl,
    });
  } catch (err) {
    next(err);
  }
});

// POST /payments/webhook — STRIPE WEBHOOK
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const sig = req.headers["stripe-signature"] as string;
    const rawBody = req.body;
    const result = await paymentService.handleStripeWebhookEvent(rawBody, sig);
    res.json(result);
  } catch (err: any) {
    console.error("Stripe Webhook Error:", err.message);
    // Misconfiguration → 500 so Stripe retries once fixed; bad signature/payload → 400
    if (err instanceof AppError && err.statusCode >= 500) {
      return res.status(err.statusCode).send("Webhook Error: server misconfigured");
    }
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

export default router;
