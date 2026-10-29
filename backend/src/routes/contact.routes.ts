import { Router, Request, Response, NextFunction } from "express";
import ContactMessage from "../models/ContactMessage";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { validate, ContactSchema, ContactReplySchema } from "../middleware/validate";
import { escapeHtml } from "../lib/escapeHtml";
import { logAudit } from "../lib/audit";
import { sendContactNotification } from "../services/email";
import { logger } from "../lib/logger";
import { formLimiter } from "../middleware/rateLimiters";

const router = Router();

// POST /contact — public
router.post("/", formLimiter(), validate(ContactSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, message, company, subject } = req.body;
    // No need for manual required checks — Zod validate() handles them above

    const msg = await ContactMessage.create({
      name,
      email,
      company: company || "",
      subject: subject || "Website Contact",
      message,
    });

    sendContactNotification({
      name: msg.name,
      email: msg.email,
      company: msg.company,
      subject: msg.subject,
      message: msg.message,
    }).catch((err) => logger.error({ err }, "Contact notification email failed"));

    res.status(201).json({ message: "Message sent successfully" });
  } catch (err) {
    next(err);
  }
});

// GET /contact — admin
router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter = req.query.unread === "true" ? { read: false } : {};
    const messages = await ContactMessage.find(filter).sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// PUT /contact/:id/read — admin
router.put("/:id/read", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const msg = await ContactMessage.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!msg) return next(createError("Message not found", 404));
    res.json(msg);
  } catch (err) {
    next(err);
  }
});

// POST /contact/reply — admin replies to a stored message (not an open relay)
router.post("/reply", requireAuth, validate(ContactReplySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { subject, body, messageId } = req.body;
    const message = await ContactMessage.findById(messageId);
    if (!message) return next(createError("Message not found", 404));

    // The reply is typed as plain text: escape it and keep its line breaks
    const html = `<div style="font-family: sans-serif; white-space: normal;">${escapeHtml(body).replace(/\n/g, "<br>")}</div>`;
    const { sendDirectReply } = await import("../services/email");
    await sendDirectReply(message.email, subject, html);

    await ContactMessage.findByIdAndUpdate(messageId, { read: true });
    await logAudit(req, "reply", "contact", messageId, message.email);
    res.json({ message: "Reply sent successfully" });
  } catch (err) {
    next(err);
  }
});

// DELETE /contact/:id — admin
router.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const msg = await ContactMessage.findByIdAndDelete(req.params.id);
    if (!msg) return next(createError("Message not found", 404));
    res.json({ message: "Message deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
