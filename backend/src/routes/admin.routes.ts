import { Router, Request, Response, NextFunction } from "express";
import TaskRequest from "../models/TaskRequest";
import ContactMessage from "../models/ContactMessage";
import Portfolio from "../models/Portfolio";
import Testimonial from "../models/Testimonial";
import Newsletter from "../models/Newsletter";
import Post from "../models/Post";
import EmailLog from "../models/EmailLog";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { outboxStatus, requeueEmail } from "../lib/emailOutbox";
import { aiUsageSummary } from "../lib/aiBudget";
import { logAudit } from "../lib/audit";
import { createError } from "../middleware/errorHandler";

const router = Router();

// GET /admin/stats — basic KPI counts
router.get("/stats", requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      totalTasks, pendingTasks, completedTasks, totalContacts,
      unreadContacts, totalPortfolio, publishedPortfolio,
      totalTestimonials, totalSubscribers, failedEmails,
    ] = await Promise.all([
      TaskRequest.countDocuments(),
      TaskRequest.countDocuments({ status: { $in: ["new", "in_review"] } }),
      TaskRequest.countDocuments({ status: "completed" }),
      ContactMessage.countDocuments(),
      ContactMessage.countDocuments({ read: false }),
      Portfolio.countDocuments(),
      Portfolio.countDocuments({ status: "published" }),
      Testimonial.countDocuments(),
      Newsletter.countDocuments({ subscribed: true }),
      EmailLog.countDocuments({ status: "failed", createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
    ]);
    const revenue = completedTasks * 15000;
    res.json({
      totalTasks, pendingTasks, completedTasks, totalContacts,
      unreadContacts, totalPortfolio, publishedPortfolio,
      totalTestimonials, totalSubscribers, revenue,
      email: { configured: outboxStatus().configured, failedLast7Days: failedEmails },
    });
  } catch (err) { next(err); }
});

// GET /admin/notifications — real-time badge counts
router.get("/notifications", requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [newTasks, unreadMessages, newSubscribers] = await Promise.all([
      TaskRequest.countDocuments({ status: "new" }),
      ContactMessage.countDocuments({ read: false }),
      Newsletter.countDocuments({ subscribed: true, createdAt: { $gte: sevenDaysAgo } }),
    ]);
    res.json({ newTasks, unreadMessages, newSubscribers, total: newTasks + unreadMessages });
  } catch (err) { next(err); }
});

// GET /admin/activity — comprehensive activity overview data
router.get("/activity", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const prevSince = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000);

    // ── 1. Trend chart: daily counts over last N days ─────────────
    const buildDailyBuckets = (numDays: number) => {
      const buckets: Record<string, { tasks: number; messages: number; subscribers: number }> = {};
      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        buckets[key] = { tasks: 0, messages: 0, subscribers: 0 };
      }
      return buckets;
    };

    const buckets = buildDailyBuckets(days);

    const [taskDocs, msgDocs, subDocs] = await Promise.all([
      TaskRequest.find({ createdAt: { $gte: since } }).select("createdAt"),
      ContactMessage.find({ createdAt: { $gte: since } }).select("createdAt"),
      Newsletter.find({ createdAt: { $gte: since }, subscribed: true }).select("createdAt"),
    ]);

    for (const doc of taskDocs) {
      const key = (doc as any).createdAt.toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].tasks++;
    }
    for (const doc of msgDocs) {
      const key = (doc as any).createdAt.toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].messages++;
    }
    for (const doc of subDocs) {
      const key = (doc as any).createdAt.toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].subscribers++;
    }

    const trendChart = Object.entries(buckets).map(([date, vals]) => ({ date, ...vals }));

    // ── 2. Task pipeline breakdown ────────────────────────────────
    const pipeline = await TaskRequest.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const taskPipeline = pipeline.map((p: any) => ({ status: p._id, count: p.count }));

    // ── 3. Top requested services ─────────────────────────────────
    const serviceAgg = await TaskRequest.aggregate([
      { $group: { _id: "$service", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]);
    const topServices = serviceAgg.map((s: any) => ({ service: s._id, count: s.count }));

    // ── 4. Period-over-period growth ──────────────────────────────
    const [
      tasksNow, tasksPrev,
      msgsNow, msgsPrev,
      subsNow, subsPrev,
    ] = await Promise.all([
      TaskRequest.countDocuments({ createdAt: { $gte: since } }),
      TaskRequest.countDocuments({ createdAt: { $gte: prevSince, $lt: since } }),
      ContactMessage.countDocuments({ createdAt: { $gte: since } }),
      ContactMessage.countDocuments({ createdAt: { $gte: prevSince, $lt: since } }),
      Newsletter.countDocuments({ createdAt: { $gte: since }, subscribed: true }),
      Newsletter.countDocuments({ createdAt: { $gte: prevSince, $lt: since }, subscribed: true }),
    ]);
    const pct = (now: number, prev: number) =>
      prev === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - prev) / prev) * 100);

    const growth = {
      tasks: { current: tasksNow, previous: tasksPrev, pct: pct(tasksNow, tasksPrev) },
      messages: { current: msgsNow, previous: msgsPrev, pct: pct(msgsNow, msgsPrev) },
      subscribers: { current: subsNow, previous: subsPrev, pct: pct(subsNow, subsPrev) },
    };

    // ── 5. Content health ─────────────────────────────────────────
    const [
      publishedPosts, draftPosts, publishedPortfolio, totalPortfolio,
      totalTestimonials, totalSubscribers, unreadMessages,
    ] = await Promise.all([
      Post.countDocuments({ status: "published" }),
      Post.countDocuments({ status: "draft" }),
      Portfolio.countDocuments({ status: "published" }),
      Portfolio.countDocuments(),
      Testimonial.countDocuments(),
      Newsletter.countDocuments({ subscribed: true }),
      ContactMessage.countDocuments({ read: false }),
    ]);
    const contentHealth = {
      publishedPosts, draftPosts, publishedPortfolio, totalPortfolio,
      totalTestimonials, totalSubscribers, unreadMessages,
    };

    // ── 6. Recent activity feed ───────────────────────────────────
    const [recentTasks, recentMsgs, recentSubs] = await Promise.all([
      TaskRequest.find().select("name service status createdAt").sort({ createdAt: -1 }).limit(5),
      ContactMessage.find().select("name subject read createdAt").sort({ createdAt: -1 }).limit(5),
      Newsletter.find({ subscribed: true }).select("name email createdAt").sort({ createdAt: -1 }).limit(4),
    ]);

    const feed = [
      ...recentTasks.map((t: any) => ({ type: "task", title: `New task from ${t.name}`, subtitle: t.service, status: t.status, at: t.createdAt })),
      ...recentMsgs.map((m: any) => ({ type: "message", title: `Message: ${m.subject}`, subtitle: m.name, status: m.read ? "read" : "unread", at: m.createdAt })),
      ...recentSubs.map((s: any) => ({ type: "subscriber", title: `New subscriber`, subtitle: s.name || s.email, status: "new", at: s.createdAt })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 12);

    // ── 7. Conversion funnel ──────────────────────────────────────
    const [totalTasks, inReview, proposalSent, inProgress, completed] = await Promise.all([
      TaskRequest.countDocuments(),
      TaskRequest.countDocuments({ status: { $in: ["in_review", "proposal_sent", "in_progress", "completed"] } }),
      TaskRequest.countDocuments({ status: { $in: ["proposal_sent", "in_progress", "completed"] } }),
      TaskRequest.countDocuments({ status: { $in: ["in_progress", "completed"] } }),
      TaskRequest.countDocuments({ status: "completed" }),
    ]);
    const funnel = [
      { stage: "Inquiries", count: totalTasks },
      { stage: "Reviewed", count: inReview },
      { stage: "Proposal Sent", count: proposalSent },
      { stage: "In Progress", count: inProgress },
      { stage: "Completed", count: completed },
    ];

    res.json({ trendChart, taskPipeline, topServices, growth, contentHealth, feed, funnel });
  } catch (err) { next(err); }
});

// GET /admin/ai-usage?days=7 — tokens and calls per day and operation, plus today's budget
router.get("/ai-usage", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(Math.max(parseInt(String(req.query.days)) || 7, 1), 90);
    res.json(await aiUsageSummary(days));
  } catch (err) { next(err); }
});

const EMAIL_STATUSES = new Set(["queued", "sending", "sent", "failed"]);

// GET /admin/email-log?status=failed — delivery log (no bodies or attachments)
router.get("/email-log", requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query.status === "string" && EMAIL_STATUSES.has(req.query.status) ? req.query.status : undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 100, 1), 500);
    const [logs, counts] = await Promise.all([
      EmailLog.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(limit)
        .select("template to subject status attempts error providerId createdAt sentAt nextAttemptAt").lean(),
      EmailLog.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);
    res.json({ ...outboxStatus(), counts: Object.fromEntries(counts.map((c) => [c._id, c.n])), logs });
  } catch (err) { next(err); }
});

// POST /admin/email-log/:id/retry — queue a failed email again
router.post("/email-log/:id/retry", requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await requeueEmail(req.params.id))) return next(createError("Only failed emails can be retried", 409));
    await logAudit(req, "update", "email", req.params.id, "Email re-queued");
    res.json({ message: "Email queued for another attempt" });
  } catch (err) { next(err); }
});

export default router;
