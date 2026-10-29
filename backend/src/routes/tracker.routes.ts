import { taskRequestService } from "../modules/task-requests/task-request.service";
import { toClientTracker } from "../lib/clientDto";
import rateLimit from "express-rate-limit";
import { paymentService } from "../modules/payments/payment.service";
import { Router, Request, Response, NextFunction } from "express";
import ProjectTracker from "../models/ProjectTracker";
import TrackerMessage from "../models/TrackerMessage";
import TaskRequest from "../models/TaskRequest";
import { requireAuth } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { validate, ChatMessageSchema, TrackerUpdateSchema } from "../middleware/validate";
import { 
  sendTrackerPhaseAdvancedEmail, 
  sendTrackerDeliverableReviewEmail,
  sendTrackerUpdateEmail,
  sendTrackerClientActionToAdminEmail 
} from "../services/email";
import { getSetting } from "../lib/configLoader";
import { pageParams, setTotal } from "../middleware/pagination";

const router = Router();
const MAX_TRACKER_AUDIT = 1000;
const MAX_TRACKER_FILES = 200;
const getAppUrl = () => getSetting("FRONTEND_URL", "http://localhost:5173");
const getClientPortalUrl = (token: string) => `${getAppUrl()}/client/project/${token}`;
const getAdminUrl = () => `${getAppUrl()}/admin/tasks`;

// ─── HELPER ────────────────────────────────────────────────────────
const writeAudit = async (tracker: any, action: string, actor: string, role: "Admin"|"Client"|"System", metadata?: any) => {
  tracker.auditLog.push({ action, actor, actorRole: role, timestamp: new Date(), metadata });
  // The embedded log keeps the latest entries only, so the document can't grow without bound
  if (tracker.auditLog.length > MAX_TRACKER_AUDIT) tracker.auditLog.splice(0, tracker.auditLog.length - MAX_TRACKER_AUDIT);
};

// ─── ADMIN ENDPOINTS ───────────────────────────────────────────────

// Summaries only (no updates/files/audit/messages); ?taskRequestId= finds one engagement's tracker
router.get("/admin/list", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {};
    if (typeof req.query.taskRequestId === "string" && /^[a-f\d]{24}$/i.test(req.query.taskRequestId)) filter.taskRequestId = req.query.taskRequestId;
    const { limit, skip } = pageParams(req, { defaultLimit: 200, maxLimit: 500 });
    const [trackers, total] = await Promise.all([
      ProjectTracker.find(filter)
        .select("-updates -files -auditLog -messages")
        .populate("taskRequestId", "name projectTitle company service status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProjectTracker.countDocuments(filter),
    ]);
    setTotal(res, total);
    res.json({ trackers, total });
  } catch (err) { next(err); }
});

router.get("/admin/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tracker = await ProjectTracker.findById(req.params.id)
      .populate("taskRequestId")
      .populate("proposalId")
      .lean();
    if (!tracker) return next(createError("Tracker not found", 404));

    // Fetch messages from separate collection and merge with legacy embedded messages
    const newMessages = await TrackerMessage.find({ trackerId: tracker._id }).sort({ sentAt: 1 }).lean();
    const legacyMessages = tracker.messages || [];
    const allMessages = [...legacyMessages, ...newMessages].sort((a: any, b: any) => 
      new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
    );
    
    res.json({ tracker: { ...tracker, messages: allMessages } });
  } catch (err) { next(err); }
});

router.post("/admin/:id/phase/advance", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nextPhase, adminNote } = req.body;
    const tracker = await ProjectTracker.findById(req.params.id);
    if (!tracker) return next(createError("Tracker not found", 404));

    // Complete current phase
    const currentPhaseIndex = tracker.phases.findIndex(p => p.name === tracker.currentPhase);
    if (currentPhaseIndex > -1) {
      tracker.phases[currentPhaseIndex].completedAt = new Date();
      if (adminNote) tracker.phases[currentPhaseIndex].adminNote = adminNote;
    }

    // Add new phase
    tracker.currentPhase = nextPhase;
    tracker.phases.push({ name: nextPhase, enteredAt: new Date() });
    await writeAudit(tracker, `Advanced to Phase: ${nextPhase}`, "Admin", "Admin");

    await tracker.save();

    // Send email
    const task = await TaskRequest.findById(tracker.taskRequestId).lean();
    if (task) {
      await sendTrackerPhaseAdvancedEmail({
        clientEmail: task.email,
        projectTitle: task.projectTitle,
        newPhase: nextPhase,
        portalUrl: getClientPortalUrl(tracker.trackerToken)
      });
    }

    res.json({ message: "Phase advanced successfully", tracker });
  } catch (err) { next(err); }
});

router.post("/admin/:id/deliverable/:dId/complete", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachedUrl } = req.body;
    const tracker = await ProjectTracker.findById(req.params.id);
    if (!tracker) return next(createError("Tracker not found", 404));

    const deliverable = tracker.deliverables.id(req.params.dId);
    if (!deliverable) return next(createError("Deliverable not found", 404));

    deliverable.status = "InReview";
    if (attachedUrl) deliverable.attachedUrl = attachedUrl;

    await writeAudit(tracker, `Marked deliverable ready for review: ${deliverable.title}`, "Admin", "Admin");
    await tracker.save();

    const task = await TaskRequest.findById(tracker.taskRequestId).lean();
    if (task) {
      await sendTrackerDeliverableReviewEmail({
        clientEmail: task.email,
        projectTitle: task.projectTitle,
        deliverableTitle: deliverable.title,
        portalUrl: getClientPortalUrl(tracker.trackerToken)
      });
    }

    res.json({ message: "Deliverable marked complete", tracker });
  } catch (err) { next(err); }
});

router.post("/admin/:id/update", requireAuth, validate(TrackerUpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, body, nextUpdateDue } = req.body;
    const tracker = await ProjectTracker.findById(req.params.id);
    if (!tracker) return next(createError("Tracker not found", 404));

    tracker.updates.unshift({ type, body, postedAt: new Date(), nextUpdateDue });
    await writeAudit(tracker, `Posted new update: ${type}`, "Admin", "Admin");
    await tracker.save();

    const task = await TaskRequest.findById(tracker.taskRequestId).lean();
    if (task) {
      await sendTrackerUpdateEmail({
        clientEmail: task.email,
        projectTitle: task.projectTitle,
        updateType: type,
        isActionRequired: type === "ActionRequired",
        portalUrl: getClientPortalUrl(tracker.trackerToken)
      });
    }

    res.json({ message: "Update posted", tracker });
  } catch (err) { next(err); }
});

router.post("/admin/:id/chat", requireAuth, validate(ChatMessageSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text } = req.body;
    // Zod validate() enforces text constraints
    const tracker = await ProjectTracker.findById(req.params.id);
    if (!tracker) return next(createError("Tracker not found", 404));

    await TrackerMessage.create({
      trackerId: tracker._id,
      sender: "Admin",
      text,
      readByAdmin: true,
      readByClient: false
    });
    
    // We don't necessarily log every chat in the audit log to avoid bloat, or we can. Let's log it.
    await writeAudit(tracker, "Sent chat message", "Admin", "Admin");
    await tracker.save();

    res.json({ message: "Message sent", tracker });
  } catch (err) { next(err); }
});


// ─── CLIENT ENDPOINTS ──────────────────────────────────────────────

router.get("/client/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tracker = await ProjectTracker.findOne({ trackerToken: req.params.token })
      .populate("taskRequestId", "name projectTitle service timeline techStack selectedPlan")
      .lean();
    if (!tracker) return next(createError("Invalid tracking token", 404));
    
    // Sanitize: remove audit log
    const sanitized: any = toClientTracker(tracker);
    
    // Fetch messages from separate collection and merge with legacy embedded messages
    const newMessages = await TrackerMessage.find({ trackerId: tracker._id }).sort({ sentAt: 1 }).lean();
    const legacyMessages = sanitized.messages || [];
    const allMessages = [...legacyMessages, ...newMessages].sort((a: any, b: any) => 
      new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
    );
    sanitized.messages = allMessages;

    res.json({ tracker: sanitized });
  } catch (err) { next(err); }
});

// ─── Client actions on tracker items ───────────────────────────────
// Each action is an atomic conditional update on one array item, so a
// repeated or concurrent click can't re-apply it (or email the admin twice).
const clientActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => `tracker:${req.params.token}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many actions on this project link. Please wait a few minutes." },
});
router.use("/client/:token", (req, res, next) => (req.method === "POST" ? clientActionLimiter(req, res, next) : next()));

async function claimItem(
  token: string,
  field: "deliverables" | "files" | "updates",
  itemId: string,
  condition: Record<string, unknown>,
  set: Record<string, unknown>
) {
  const prefixed = (o: Record<string, unknown>, prefix: string) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [`${prefix}${k}`, v]));
  const tracker = await ProjectTracker.findOneAndUpdate(
    { trackerToken: token, [field]: { $elemMatch: { _id: itemId, ...condition } } },
    { $set: prefixed(set, `${field}.$.`) },
    { new: true }
  );
  if (tracker) return { tracker, item: (tracker as any)[field].id(itemId) };

  const existing = await ProjectTracker.findOne({ trackerToken: token }).select(`_id ${field}._id`).lean();
  if (!existing) throw createError("Invalid token", 404);
  if (!(existing as any)[field]?.some((i: any) => String(i._id) === itemId)) throw createError("Item not found", 404);
  throw createError("This item has already been actioned.", 409);
}

router.post("/client/:token/deliverable/:dId/approve", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tracker, item } = await claimItem(req.params.token, "deliverables", req.params.dId, { status: "InReview" }, {
      status: "Approved",
      clientApprovedAt: new Date(),
    });
    const task = await TaskRequest.findById(tracker.taskRequestId).lean();
    await writeAudit(tracker, `Approved deliverable: ${item.title}`, task?.name || "Client", "Client");
    await tracker.save();

    await sendTrackerClientActionToAdminEmail({
      actionStr: "approved a deliverable",
      projectTitle: task?.projectTitle || "",
      targetName: item.title,
      adminUrl: getAdminUrl()
    });

    res.json({ message: "Deliverable approved", tracker: toClientTracker(tracker) });
  } catch (err) { next(err); }
});

router.post("/client/:token/deliverable/:dId/reject", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const note = String(req.body.clientRejectionNote ?? "").slice(0, 2000);
    const { tracker, item } = await claimItem(req.params.token, "deliverables", req.params.dId, { status: "InReview" }, {
      status: "Rejected",
      clientRejectionNote: note,
    });
    const task = await TaskRequest.findById(tracker.taskRequestId).lean();
    await writeAudit(tracker, `Requested changes on deliverable: ${item.title}`, task?.name || "Client", "Client");
    await tracker.save();

    await sendTrackerClientActionToAdminEmail({
      actionStr: "requested changes on a deliverable",
      projectTitle: task?.projectTitle || "",
      targetName: item.title,
      adminUrl: getAdminUrl()
    });

    res.json({ message: "Deliverable rejected", tracker: toClientTracker(tracker) });
  } catch (err) { next(err); }
});

router.post("/client/:token/update/:uId/acknowledge", async (req: Request, res: Response, next: NextFunction) => {
  try {
    let result;
    try {
      result = await claimItem(req.params.token, "updates", req.params.uId, { clientAcknowledgedAt: null }, { clientAcknowledgedAt: new Date() });
    } catch (err: any) {
      // Acknowledging twice is harmless: return the tracker unchanged
      if (err.statusCode !== 409) throw err;
      const tracker = await ProjectTracker.findOne({ trackerToken: req.params.token });
      return res.json({ message: "Update acknowledged", tracker: toClientTracker(tracker!) });
    }
    const task = await TaskRequest.findById(result.tracker.taskRequestId).lean();
    await writeAudit(result.tracker, `Acknowledged update`, task?.name || "Client", "Client");
    await result.tracker.save();

    res.json({ message: "Update acknowledged", tracker: toClientTracker(result.tracker) });
  } catch (err) { next(err); }
});

router.post("/client/:token/chat", validate(ChatMessageSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text } = req.body;
    // Zod validate() enforces text constraints
    const tracker = await ProjectTracker.findOne({ trackerToken: req.params.token });
    if (!tracker) return next(createError("Invalid token", 404));

    await TrackerMessage.create({
      trackerId: tracker._id,
      sender: "Client",
      text,
      readByAdmin: false,
      readByClient: true
    });
    
    // Maybe don't spam audit log with chat messages, just save.
    await tracker.save();

    res.json({ message: "Message sent", tracker: toClientTracker(tracker) });
  } catch (err) { next(err); }
});

// ─── ADMIN: Request final client sign-off ──────────────────────────
router.post("/admin/:id/completion/request", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tracker = await ProjectTracker.findById(req.params.id);
    if (!tracker) return next(createError("Tracker not found", 404));
    if (tracker.completionRequestedAt) return next(createError("Sign-off already requested", 400));

    // Preconditions check
    const pendingDeliverables = tracker.deliverables.filter(d => d.status !== "Approved");
    if (pendingDeliverables.length > 0) return next(createError(`Cannot request sign-off: ${pendingDeliverables.length} deliverable(s) are pending client approval.`, 400));
    
    const unpaidMilestones = tracker.milestones.filter(m => !m.paidAt);
    if (unpaidMilestones.length > 0) return next(createError(`Cannot request sign-off: ${unpaidMilestones.length} milestone(s) are unpaid.`, 400));
    
    if (tracker.currentPhase !== "Delivery") return next(createError(`Cannot request sign-off: Project phase must be "Delivery" (currently "${tracker.currentPhase}").`, 400));

    tracker.completionRequestedAt = new Date();
    await writeAudit(tracker, "Requested final client sign-off", "Admin", "Admin");
    await tracker.save();

    const task = await TaskRequest.findById(tracker.taskRequestId).lean() as any;
    if (task) {
      const { sendTrackerCompletionRequestEmail } = await import("../services/email");
      await sendTrackerCompletionRequestEmail({
        clientEmail: task.email,
        clientName: task.name,
        projectTitle: task.projectTitle,
        portalUrl: getClientPortalUrl(tracker.trackerToken),
      });
    }

    res.json({ message: "Sign-off request sent to client", tracker });
  } catch (err) { next(err); }
});

// ─── CLIENT: Approve project completion ────────────────────────────
router.post("/client/:token/completion/approve", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Claim the approval atomically: concurrent clicks get exactly one success
    const tracker = await ProjectTracker.findOneAndUpdate(
      { trackerToken: req.params.token, completionRequestedAt: { $ne: null }, completionApprovedAt: null },
      { $set: { completionApprovedAt: new Date() } },
      { new: true }
    );
    if (!tracker) {
      const existing = await ProjectTracker.findOne({ trackerToken: req.params.token }).select("completionRequestedAt completionApprovedAt").lean();
      if (!existing) return next(createError("Invalid token", 404));
      if (!existing.completionRequestedAt) return next(createError("No sign-off requested yet", 400));
      return next(createError("Already approved", 409));
    }

    try {
      await taskRequestService.transitionStatus(
        String(tracker.taskRequestId),
        "completed",
        "client",
        `Project completed and approved by client on ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}`
      );
    } catch (err) {
      // The task isn't in progress any more (e.g. cancelled): release the claim
      await ProjectTracker.updateOne({ _id: tracker._id }, { $set: { completionApprovedAt: null } });
      throw err;
    }

    const task = await TaskRequest.findById(tracker.taskRequestId).lean() as any;
    await writeAudit(tracker, `Project completion approved by client: ${task?.name || "Client"}`, task?.name || "Client", "Client");
    await tracker.save();

    // Notify admin
    if (task) {
      const { sendTrackerCompletionApprovedEmail } = await import("../services/email");
      await sendTrackerCompletionApprovedEmail({
        projectTitle: task.projectTitle,
        clientName: task.name,
        adminUrl: getAdminUrl(),
      });
    }

    res.json({ message: "Project marked as completed. Thank you!" });
  } catch (err) { next(err); }
});

// ─── ADMIN: Mark milestone payable → create Stripe Checkout ────────
router.post("/admin/:id/milestone/:mId/mark-payable", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tracker = await ProjectTracker.findById(req.params.id);
    if (!tracker) return next(createError("Tracker not found", 404));

    const milestone = tracker.milestones.id(req.params.mId);
    if (!milestone) return next(createError("Milestone not found", 404));
    if (milestone.paidAt) return next(createError("Milestone already paid", 400));

    const task = await TaskRequest.findById(tracker.taskRequestId).lean() as any;
    if (!task) return next(createError("Task not found", 404));

    // A pending Payment the client pays from the project hub (same checkout and webhook path as invoices)
    const payment = await paymentService.milestonePayment(String(tracker._id), String(milestone._id));

    milestone.paymentRequestedAt = new Date();
    await writeAudit(tracker, `Milestone marked payable: ${milestone.title}`, "Admin", "Admin");
    await tracker.save();

    const { sendTrackerPaymentDueEmail } = await import("../services/email");
    await sendTrackerPaymentDueEmail({
      clientEmail: task.email,
      projectTitle: task.projectTitle,
      milestoneTitle: milestone.title,
      amountFormatted: `$${(milestone.amount / 100).toFixed(2)}`,
      portalUrl: getClientPortalUrl(tracker.trackerToken),
    });

    res.json({ message: "Payment requested", invoiceToken: payment.invoiceToken });
  } catch (err) { next(err); }
});

// ─── ADMIN: Mark milestone paid manually (wire, check, outside stripe) ─
router.post("/admin/:id/milestone/:mId/mark-paid-manually", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { paymentMethod, note } = req.body;
    const tracker = await ProjectTracker.findById(req.params.id);
    if (!tracker) return next(createError("Tracker not found", 404));

    const milestone = tracker.milestones.id(req.params.mId);
    if (!milestone) return next(createError("Milestone not found", 404));
    if (milestone.paidAt) return next(createError("Milestone already paid", 400));

    milestone.paidAt = new Date();
    await writeAudit(tracker, `Milestone marked paid manually: ${milestone.title}`, "Admin", "Admin", { paymentMethod, note });
    await tracker.save();

    const task = await TaskRequest.findById(tracker.taskRequestId).lean() as any;
    if (task) {
      const { sendTrackerPaymentConfirmedEmail } = await import("../services/email");
      await sendTrackerPaymentConfirmedEmail({
        clientEmail: task.email,
        projectTitle: task.projectTitle,
        milestoneTitle: milestone.title,
        amountFormatted: `$${(milestone.amount / 100).toFixed(2)}`,
        portalUrl: getClientPortalUrl(tracker.trackerToken),
      });
    }

    res.json({ message: "Milestone marked as paid manually", tracker });
  } catch (err) { next(err); }
});

// ─── ADMIN: Upload file ──────────────────────────────────────────────
router.post("/admin/:id/file/upload", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { upload, uploadDocument, uploadImage } = await import("../services/cloudinary");

    // Multer middleware inline
    upload.single("file")(req as any, res as any, async (err: any) => {
      if (err) return next(createError(err.message, 400));
      if (!(req as any).file) return next(createError("No file provided", 400));

      const tracker = await ProjectTracker.findById(req.params.id);
      if (!tracker) return next(createError("Tracker not found", 404));
      if (tracker.files.length >= MAX_TRACKER_FILES) {
        return next(createError(`This project already has ${MAX_TRACKER_FILES} files — remove some before uploading more`, 409));
      }

      const file = (req as any).file;
      const folder = `projects/${tracker.taskRequestId}/files`;
      const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.originalname);

      let result;
      if (isImage) {
        result = await uploadImage(file.buffer, folder, undefined, `project:${tracker.taskRequestId}`);
      } else {
        result = await uploadDocument(file.buffer, file.originalname, folder, `project:${tracker.taskRequestId}`);
      }

      tracker.files.push({
        filename: file.originalname,
        cloudinaryUrl: result.url,
        cloudinaryPublicId: result.publicId,
        version: 1,
        uploadedAt: new Date(),
        approvalStatus: "Pending",
      });

      await writeAudit(tracker, `Uploaded file: ${file.originalname}`, "Admin", "Admin");
      await tracker.save();

      const task = await TaskRequest.findById(tracker.taskRequestId).lean() as any;
      if (task) {
        const { sendTrackerFileEmail } = await import("../services/email");
        await sendTrackerFileEmail({
          clientEmail: task.email,
          projectTitle: task.projectTitle,
          filename: file.originalname,
          portalUrl: getClientPortalUrl(tracker.trackerToken),
        });
      }

      res.json({ message: "File uploaded", tracker });
    });
  } catch (err) { next(err); }
});

// ─── ADMIN: Audit log ───────────────────────────────────────────────
router.get("/admin/:id/audit", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tracker = await ProjectTracker.findById(req.params.id).select("auditLog").lean();
    if (!tracker) return next(createError("Tracker not found", 404));
    res.json({ auditLog: tracker.auditLog });
  } catch (err) { next(err); }
});

// ─── CLIENT: Approve file ──────────────────────────────────────────
router.post("/client/:token/file/:fId/approve", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tracker, item } = await claimItem(req.params.token, "files", req.params.fId, { approvalStatus: "Pending" }, {
      approvalStatus: "Approved",
      approvedAt: new Date(),
    });
    const task = await TaskRequest.findById(tracker.taskRequestId).lean() as any;
    await writeAudit(tracker, `Approved file: ${item.filename}`, task?.name || "Client", "Client");
    await tracker.save();
    await sendTrackerClientActionToAdminEmail({ actionStr: "approved a file", projectTitle: task?.projectTitle || "", targetName: item.filename, adminUrl: getAdminUrl() });
    res.json({ message: "File approved", tracker: toClientTracker(tracker) });
  } catch (err) { next(err); }
});

// ─── CLIENT: Reject file ───────────────────────────────────────────
router.post("/client/:token/file/:fId/reject", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tracker, item } = await claimItem(req.params.token, "files", req.params.fId, { approvalStatus: "Pending" }, {
      approvalStatus: "Rejected",
      clientComment: String(req.body.clientComment ?? "").slice(0, 2000),
    });
    const task = await TaskRequest.findById(tracker.taskRequestId).lean() as any;
    await writeAudit(tracker, `Rejected file: ${item.filename}`, task?.name || "Client", "Client");
    await tracker.save();
    await sendTrackerClientActionToAdminEmail({ actionStr: "rejected a file", projectTitle: task?.projectTitle || "", targetName: item.filename, adminUrl: getAdminUrl() });
    res.json({ message: "File rejected", tracker: toClientTracker(tracker) });
  } catch (err) { next(err); }
});

// ─── CLIENT: Checkout for milestone ───────────────────────────────
// The client clicks "Pay Now" → hits this endpoint to get a fresh checkout URL
router.post("/client/:token/milestone/:mId/checkout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tracker = await ProjectTracker.findOne({ trackerToken: req.params.token });
    if (!tracker) return next(createError("Invalid token", 404));

    const milestone = tracker.milestones.id(req.params.mId);
    if (!milestone) return next(createError("Milestone not found", 404));
    if (milestone.paidAt) return res.json({ alreadyPaid: true });
    if (!milestone.paymentRequestedAt) return next(createError("This milestone isn't due for payment yet.", 409));

    const payment = await paymentService.milestonePayment(String(tracker._id), String(milestone._id));
    if (payment.status === "paid") return res.json({ alreadyPaid: true });
    const checkoutUrl = await paymentService.processInvoiceCheckout(payment.invoiceToken!);
    res.json({ checkoutUrl });
  } catch (err) { next(err); }
});

// ─── ADMIN: Generate short-lived signed download URL for a project file ──────
// Prevents permanent public Cloudinary URLs from being shared or indexed.
// Signed URLs expire after 5 minutes — admin must request a fresh one each time.
router.get("/admin/:id/file/:fId/download-url", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tracker = await ProjectTracker.findById(req.params.id).lean();
    if (!tracker) return next(createError("Tracker not found", 404));

    const file = tracker.files.find((f) => f._id?.toString() === req.params.fId);
    if (!file) return next(createError("File not found", 404));

    const { cloudinary: cloudinaryInstance } = await import("../services/cloudinary");

    // Generate a signed URL valid for 300 seconds (5 minutes)
    const signedUrl = cloudinaryInstance.url(file.cloudinaryPublicId, {
      sign_url: true,
      resource_type: "raw",
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });

    res.json({
      url: signedUrl,
      filename: file.filename,
      expiresInSeconds: 300,
    });
  } catch (err) { next(err); }
});

export default router;

