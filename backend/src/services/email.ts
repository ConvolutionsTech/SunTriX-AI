import { resendAdapter } from "../integrations/resend/resend.adapter";
import { getSetting } from "../lib/configLoader";
import { escapeFields } from "../lib/escapeHtml";
import { logger } from "../lib/logger";
import { outbox, sendNow } from "../lib/emailOutbox";

// Transactional mail goes through the outbox (lib/emailOutbox.ts): queued,
// delivered by the scheduler with retries, and visible in Admin → Email log.
// Only the newsletter batch send talks to Resend directly.
function getResend() {
  return resendAdapter;
}

function getAdminEmail()   { return getSetting("ADMIN_EMAIL",         "admin@suntrix.com"); }
function getFrontendUrl()  { return getSetting("FRONTEND_URL",        "http://localhost:5173"); }
function getPaymentSla()   { return getSetting("EMAIL_PAYMENT_SLA",   "2 business hours"); }
function getKickoffSla()   { return getSetting("EMAIL_KICKOFF_SLA",   "24 hours"); }
function getBrandName()    { return getSetting("BRAND_NAME",           "SunTriX AI Solutions"); }
function getBrandWebsite() { return getSetting("BRAND_WEBSITE",        "suntrix.ai"); }
function getBatchSize()    { return parseInt(getSetting("NEWSLETTER_BATCH_SIZE", "100")); }

// Single source for the sender: EMAIL_FROM if set, otherwise name + address
export function getFromAddress(): string {
  const explicit = getSetting("EMAIL_FROM");
  if (explicit) return explicit;
  const name    = getSetting("FROM_EMAIL_NAME",    "SunTriX");
  const address = getSetting("FROM_EMAIL_ADDRESS", "onboarding@resend.dev");
  return `${name} <${address}>`;
}

// ─── Contact notification ──────────────────────────────────────────────────
export async function sendContactNotification(data: {
  name: string;
  email: string;
  company?: string;
  subject: string;
  message: string;
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  if (getSetting("EMAIL_CONTACT_NOTIFICATIONS", "true") !== "true") return;

  try {
    const { error } = await outbox("contactNotification").send({
      from: getFromAddress(),
      to: [getAdminEmail()],
      subject: `[${getBrandName()}] New Contact: ${data.subject}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f97316;">New Contact Message</h2>
          <table style="width:100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; font-weight: bold;">Name</td><td style="padding: 8px;">${e.name}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;"><a href="mailto:${e.email}">${e.email}</a></td></tr>
            ${e.company ? `<tr><td style="padding: 8px; font-weight: bold;">Company</td><td style="padding: 8px;">${e.company}</td></tr>` : ""}
            <tr style="background:#f9f9f9;"><td style="padding: 8px; font-weight: bold;">Subject</td><td style="padding: 8px;">${e.subject}</td></tr>
          </table>
          <div style="margin-top: 16px; padding: 16px; background: #f3f4f6; border-radius: 8px;">
            <p style="font-weight: bold; margin: 0 0 8px;">Message:</p>
            <p style="margin: 0; white-space: pre-wrap;">${e.message}</p>
          </div>
          <p style="margin-top: 16px; color: #6b7280; font-size: 12px;">View all messages in the <a href="${getFrontendUrl()}/admin/messages">Admin Dashboard</a>.</p>
        </div>
      `,
    });
    if (error) logger.error({ err: error }, "Resend Notification Error (Contact)");
  } catch (err: any) {
    logger.error({ err }, "Failed to send contact notification email");
  }
}

// ─── Task request notification ─────────────────────────────────────────────
export async function sendTaskNotification(data: {
  name: string;
  email: string;
  company?: string;
  service: string;
  budget: string;
  priority: string;
  projectTitle: string;
  description: string;
  selectedPlan?: string;   // dynamic — from whatever plan admin configured
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  if (getSetting("EMAIL_TASK_NOTIFICATIONS", "true") !== "true") return;

  try {
    const { error } = await outbox("taskNotification").send({
      from: getFromAddress(),
      to: [getAdminEmail()],
      subject: `[${getBrandName()}] New Task Request: ${data.projectTitle || data.service}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f97316;">🚀 New Task Request</h2>
          <table style="width:100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; font-weight: bold;">Name</td><td style="padding: 8px;">${e.name}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;"><a href="mailto:${e.email}">${e.email}</a></td></tr>
            ${e.company ? `<tr><td style="padding: 8px; font-weight: bold;">Company</td><td style="padding: 8px;">${e.company}</td></tr>` : ""}
            <tr style="background:#f9f9f9;"><td style="padding: 8px; font-weight: bold;">Project</td><td style="padding: 8px;">${e.projectTitle}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Service</td><td style="padding: 8px;">${e.service}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding: 8px; font-weight: bold;">Budget</td><td style="padding: 8px;">${e.budget || "Not specified"}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Priority</td><td style="padding: 8px;">${e.priority}</td></tr>
            ${e.selectedPlan ? `<tr style="background:#fff7ed;"><td style="padding: 8px; font-weight: bold; color:#f97316;">Selected Plan</td><td style="padding: 8px; font-weight:bold;">${e.selectedPlan}</td></tr>` : ""}
          </table>
          <div style="margin-top: 16px; padding: 16px; background: #f3f4f6; border-radius: 8px;">
            <p style="font-weight: bold; margin: 0 0 8px;">Description:</p>
            <p style="margin: 0; white-space: pre-wrap;">${e.description}</p>
          </div>
          <p style="margin-top: 16px; color: #6b7280; font-size: 12px;">Manage this request in the <a href="${getFrontendUrl()}/admin/tasks">Admin Dashboard</a>.</p>
        </div>
      `,
    });
    if (error) logger.error({ err: error }, "Resend Notification Error (Task)");
  } catch (err: any) {
    logger.error({ err }, "Failed to send task notification email");
  }
}

// ─── Project Tracker Notifications ──────────────────────────────────────────

export async function sendTrackerPhaseAdvancedEmail(data: { clientEmail: string; projectTitle: string; newPhase: string; portalUrl: string; }): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    await outbox("trackerPhaseAdvancedEmail").send({
      from: getFromAddress(),
      to: [data.clientEmail],
      subject: `Project Update: Now in ${data.newPhase} — ${data.projectTitle}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
        <h2 style="color:#4f46e5;margin-top:0;">🚀 Phase Advanced</h2>
        <p style="color:#374151;font-size:16px;">Great news! <strong>${e.projectTitle}</strong> has officially advanced to the <strong>${e.newPhase}</strong> phase.</p>
        <p style="color:#6b7280;margin-bottom:24px;">You can view the updated timeline and current focus areas in your Project Hub.</p>
        <a href="${e.portalUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">View Project Hub</a>
      </div>`,
    });
  } catch (err) { logger.error({ err }, "Email Error"); }
}

export async function sendTrackerDeliverableReviewEmail(data: { clientEmail: string; projectTitle: string; deliverableTitle: string; portalUrl: string; }): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    await outbox("trackerDeliverableReviewEmail").send({
      from: getFromAddress(),
      to: [data.clientEmail],
      subject: `Action Required: Review Deliverable for ${data.projectTitle}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
        <h2 style="color:#f59e0b;margin-top:0;">👀 Deliverable Ready for Review</h2>
        <p style="color:#374151;font-size:16px;">We have submitted a deliverable for your approval: <strong>${e.deliverableTitle}</strong>.</p>
        <p style="color:#6b7280;margin-bottom:24px;">Please review the attached materials in your Project Hub and let us know if you approve or require changes.</p>
        <a href="${e.portalUrl}" style="display:inline-block;background:#f59e0b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Review Deliverable</a>
      </div>`,
    });
  } catch (err) { logger.error({ err }, "Email Error"); }
}

export async function sendTrackerUpdateEmail(data: { clientEmail: string; projectTitle: string; updateType: string; portalUrl: string; isActionRequired: boolean; }): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    const color = data.isActionRequired ? "#ef4444" : "#10b981";
    await outbox("trackerUpdateEmail").send({
      from: getFromAddress(),
      to: [data.clientEmail],
      subject: `${data.isActionRequired ? 'Action Required: ' : ''}New Update on ${data.projectTitle}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
        <h2 style="color:${color};margin-top:0;">📝 Project Update Posted</h2>
        <p style="color:#374151;font-size:16px;">We've posted a new <strong>${e.updateType}</strong> regarding your project.</p>
        <a href="${e.portalUrl}" style="display:inline-block;background:${color};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Read Update</a>
      </div>`,
    });
  } catch (err) { logger.error({ err }, "Email Error"); }
}

export async function sendTrackerFileEmail(data: { clientEmail: string; projectTitle: string; filename: string; portalUrl: string; }): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    await outbox("trackerFileEmail").send({
      from: getFromAddress(),
      to: [data.clientEmail],
      subject: `New File Shared: ${data.filename} — ${data.projectTitle}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
        <h2 style="color:#3b82f6;margin-top:0;">📁 File Ready for Review</h2>
        <p style="color:#374151;font-size:16px;">A new file has been shared with you: <strong>${e.filename}</strong>.</p>
        <a href="${e.portalUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">View File</a>
      </div>`,
    });
  } catch (err) { logger.error({ err }, "Email Error"); }
}

export async function sendTrackerPaymentDueEmail(data: { clientEmail: string; projectTitle: string; milestoneTitle: string; amountFormatted: string; portalUrl: string; }): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    await outbox("trackerPaymentDueEmail").send({
      from: getFromAddress(),
      to: [data.clientEmail],
      subject: `Invoice Ready: ${data.milestoneTitle} — ${data.projectTitle}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
        <h2 style="color:#ef4444;margin-top:0;">💳 Payment Due</h2>
        <p style="color:#374151;font-size:16px;">An invoice of <strong>${e.amountFormatted}</strong> is now due for the milestone: <strong>${e.milestoneTitle}</strong>.</p>
        <p style="color:#6b7280;margin-bottom:24px;">You can pay this securely via your Project Hub.</p>
        <a href="${e.portalUrl}" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Pay Invoice Now</a>
      </div>`,
    });
  } catch (err) { logger.error({ err }, "Email Error"); }
}

export async function sendTrackerPaymentConfirmedEmail(data: { clientEmail: string; projectTitle: string; milestoneTitle: string; amountFormatted: string; portalUrl: string; }): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    await outbox("trackerPaymentConfirmedEmail").send({
      from: getFromAddress(),
      to: [data.clientEmail],
      subject: `Payment Received: ${data.milestoneTitle} — ${data.projectTitle}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
        <h2 style="color:#10b981;margin-top:0;">✅ Payment Confirmed</h2>
        <p style="color:#374151;font-size:16px;">We have successfully received your payment of <strong>${e.amountFormatted}</strong> for <strong>${e.milestoneTitle}</strong>.</p>
        <p style="color:#6b7280;margin-bottom:24px;">Thank you for your prompt payment!</p>
        <a href="${e.portalUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Go to Project Hub</a>
      </div>`,
    });
  } catch (err) { logger.error({ err }, "Email Error"); }
}

export async function sendTrackerClientActionToAdminEmail(data: { actionStr: string; projectTitle: string; targetName: string; adminUrl: string; }): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    await outbox("trackerClientActionToAdminEmail").send({
      from: getFromAddress(),
      to: [getAdminEmail()],
      subject: `Client ${data.actionStr} — ${data.projectTitle}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
        <h2 style="color:#4f46e5;margin-top:0;">Client Action Logged</h2>
        <p style="color:#374151;font-size:16px;">The client has <strong>${e.actionStr}</strong> for: <strong>${e.targetName}</strong>.</p>
        <a href="${e.adminUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Open Admin Dashboard</a>
      </div>`,
    });
  } catch (err) { logger.error({ err }, "Email Error"); }
}
// ─── Invoice / proposal email ──────────────────────────────────────────────
export async function sendInvoiceEmail(data: {
  clientName: string;
  clientEmail: string;
  description: string;
  amountUSD: string;
  invoiceUrl: string;
  expiresAt: string;
  projectTitle?: string;
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  const brand   = getBrandName();
  const website = getBrandWebsite();
  const appUrl  = getFrontendUrl();

  try {
    const { error } = await outbox("invoiceEmail").send({
      from: getFromAddress(),
      to: [data.clientEmail],
      subject: `Invoice from ${brand} — ${data.description}`,
      html: `
        <div style="font-family:'Segoe UI',sans-serif;background:#0f0f0f;padding:40px 20px;min-height:100vh;">
          <div style="max-width:560px;margin:0 auto;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#f97316,#fb923c);padding:32px;text-align:center;">
              <p style="color:rgba(255,255,255,0.8);font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px;">${brand}</p>
              <h1 style="color:#fff;font-size:28px;font-weight:800;margin:0;">Invoice / Proposal</h1>
            </div>
            <div style="padding:32px;">
              <p style="color:#d4d4d4;font-size:15px;line-height:1.6;margin:0 0 24px;">
                Hi ${e.clientName || "there"},<br><br>
                Thank you for your interest in working with ${brand}. We've prepared a proposal for your project.
                Please review the details below and click the button to proceed with payment.
              </p>
              <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:20px;margin-bottom:24px;">
                ${e.projectTitle ? `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2a2a2a;"><span style="color:#888;font-size:13px;">Project</span><span style="color:#fff;font-size:13px;font-weight:600;">${e.projectTitle}</span></div>` : ""}
                <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2a2a2a;"><span style="color:#888;font-size:13px;">Service</span><span style="color:#fff;font-size:13px;font-weight:600;">${e.description}</span></div>
                <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2a2a2a;"><span style="color:#888;font-size:13px;">Invoice Expires</span><span style="color:#f59e0b;font-size:13px;font-weight:600;">${e.expiresAt}</span></div>
                <div style="display:flex;justify-content:space-between;padding:16px 0 0;"><span style="color:#888;font-size:15px;font-weight:700;">Total Due</span><span style="color:#f97316;font-size:24px;font-weight:800;">${e.amountUSD}</span></div>
              </div>
              <div style="text-align:center;margin-bottom:24px;">
                <a href="${e.invoiceUrl}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#fb923c);color:#fff;font-weight:800;font-size:16px;padding:16px 40px;border-radius:12px;text-decoration:none;letter-spacing:0.5px;">
                  View &amp; Pay Invoice →
                </a>
              </div>
              <p style="color:#666;font-size:12px;text-align:center;line-height:1.6;">
                🔒 Secured by Stripe. We never store your card details.<br>
                Questions? Reply to this email or <a href="${appUrl}/contact" style="color:#f97316;">contact us here</a>.
              </p>
            </div>
            <div style="border-top:1px solid #2a2a2a;padding:16px 32px;text-align:center;">
              <p style="color:#555;font-size:11px;margin:0;">© ${new Date().getFullYear()} ${brand} · ${website}</p>
            </div>
          </div>
        </div>
      `,
    });
    if (error) logger.error({ err: error }, "Resend Invoice Email Error");
  } catch (err: any) {
    logger.error({ err }, "Failed to send invoice email");
  }
}

// ─── Payment confirmation ──────────────────────────────────────────────────
export async function sendPaymentConfirmation(data: {
  clientName: string;
  clientEmail: string;
  description: string;
  amountUSD: string;
  receiptUrl?: string;
  trackingUrl?: string;
  paidAt: string;
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  const brand   = getBrandName();
  const website = getBrandWebsite();
  const appUrl  = getFrontendUrl();
  const sla     = getPaymentSla();
  const kickoff = getKickoffSla();

  try {
    const { error } = await outbox("paymentConfirmation").send({
      from: getFromAddress(),
      to: [data.clientEmail],
      subject: `✅ Payment Confirmed — ${brand}`,
      html: `
        <div style="font-family:'Segoe UI',sans-serif;background:#0f0f0f;padding:40px 20px;min-height:100vh;">
          <div style="max-width:560px;margin:0 auto;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#10b981,#059669);padding:32px;text-align:center;">
              <div style="width:64px;height:64px;background:rgba(255,255,255,0.15);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
                <span style="font-size:32px;">✅</span>
              </div>
              <h1 style="color:#fff;font-size:26px;font-weight:800;margin:0;">Payment Confirmed!</h1>
              <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Your project is now active</p>
            </div>
            <div style="padding:32px;">
              <p style="color:#d4d4d4;font-size:15px;line-height:1.6;margin:0 0 24px;">
                Hi ${e.clientName || "there"},<br><br>
                Thank you for your payment! We've received it and your project is now active.
                Our team will reach out within <strong style="color:#fff;">${sla}</strong> to discuss next steps.
              </p>
              <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:20px;margin-bottom:24px;">
                <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2a2a2a;"><span style="color:#888;font-size:13px;">Service</span><span style="color:#fff;font-size:13px;font-weight:600;">${e.description}</span></div>
                <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2a2a2a;"><span style="color:#888;font-size:13px;">Date</span><span style="color:#fff;font-size:13px;font-weight:600;">${e.paidAt}</span></div>
                <div style="display:flex;justify-content:space-between;padding:16px 0 0;"><span style="color:#888;font-size:15px;font-weight:700;">Amount Paid</span><span style="color:#10b981;font-size:24px;font-weight:800;">${e.amountUSD}</span></div>
              </div>
              <div style="background:#0d1f17;border:1px solid #065f46;border-radius:12px;padding:20px;margin-bottom:24px;">
                <p style="color:#10b981;font-weight:700;font-size:13px;letter-spacing:1px;text-transform:uppercase;margin:0 0 16px;">What happens next</p>
                <p style="color:#d4d4d4;font-size:13px;margin:0 0 10px;">✅ &nbsp;Email confirmation sent (you're reading it!)</p>
                <p style="color:#d4d4d4;font-size:13px;margin:0 0 10px;">⏳ &nbsp;Your project manager contacts you within ${sla}</p>
                <p style="color:#d4d4d4;font-size:13px;margin:0 0 10px;">📅 &nbsp;Kickoff call scheduled within ${kickoff}</p>
                <p style="color:#d4d4d4;font-size:13px;margin:0;">🚀 &nbsp;Development begins after kickoff</p>
              </div>
              <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-bottom:24px;">
                ${e.trackingUrl ? `<a href="${e.trackingUrl}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#fb923c);color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">Track My Project →</a>` : ""}
                ${e.receiptUrl ? `<a href="${e.receiptUrl}" style="display:inline-block;background:#1a1a1a;border:1px solid #2a2a2a;color:#d4d4d4;font-weight:600;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">Download Receipt</a>` : ""}
              </div>
              <p style="color:#666;font-size:12px;text-align:center;line-height:1.6;">
                Questions? Reply to this email or <a href="${appUrl}/contact" style="color:#f97316;">contact us here</a>.
              </p>
            </div>
            <div style="border-top:1px solid #2a2a2a;padding:16px 32px;text-align:center;">
              <p style="color:#555;font-size:11px;margin:0;">© ${new Date().getFullYear()} ${brand} · ${website}</p>
            </div>
          </div>
        </div>
      `,
    });
    if (error) logger.error({ err: error }, "Resend Payment Confirmation Error");
  } catch (err: any) {
    logger.error({ err }, "Failed to send payment confirmation email");
  }
}

// ─── Newsletter broadcast ──────────────────────────────────────────────────
export interface BroadcastRecipient {
  email: string;
  /** Public page that unsubscribes this recipient (one link per subscriber) */
  unsubscribeUrl: string;
}

function withUnsubscribeFooter(htmlBody: string, unsubscribeUrl: string): string {
  const url = escapeFields(unsubscribeUrl);
  return `${htmlBody}
<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
  You're receiving this because you subscribed to ${escapeFields(getBrandName())} updates.
  <a href="${url}" style="color:#9ca3af;">Unsubscribe</a>
</div>`;
}

export async function sendNewsletterBroadcast(
  subject: string,
  htmlBody: string,
  recipients: BroadcastRecipient[]
): Promise<{ sentCount: number; error?: string }> {
  let sentCount = 0;
  if (!recipients.length) return { sentCount };

  const BATCH_SIZE = getBatchSize();
  const emails = recipients.map((r) => ({
    from: getFromAddress(),
    to: [r.email],
    subject,
    html: withUnsubscribeFooter(htmlBody, r.unsubscribeUrl),
    headers: { "List-Unsubscribe": `<${r.unsubscribeUrl}>` },
  }));

  try {
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      const { error } = await getResend().batch.send(batch);
      if (error) {
        // Includes Resend test mode ("testing email address" restriction): nothing was delivered
        logger.error({ err: error }, "Resend Batch Error");
        return { sentCount, error: error.message };
      }
      sentCount += batch.length;
    }
    return { sentCount };
  } catch (err: any) {
    logger.error({ err }, "Broadcast failed");
    return { sentCount, error: err.message || "Failed to broadcast" };
  }
}

export async function sendCampaignFailureNotification(data: {
  subject: string;
  sentCount: number;
  totalCount: number;
  errorMessage: string;
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    const { error } = await outbox("campaignFailureNotification").send({
      from: getFromAddress(),
      to: [getAdminEmail()],
      subject: `⚠️ Campaign Delivery Failed — ${data.subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;padding:24px;">
          <h2 style="color:#ef4444;margin-top:0;">Broadcast Failed</h2>
          <p>The campaign <strong>"${e.subject}"</strong> encountered an error during delivery.</p>
          <ul>
            <li><strong>Sent:</strong> ${e.sentCount} out of ${e.totalCount}</li>
            <li><strong>Error:</strong> ${e.errorMessage}</li>
          </ul>
          <p>You can retry the remaining unsent emails from the Admin Dashboard.</p>
        </div>`,
    });
    if (error) logger.error({ err: error }, "Resend Failure Email Error");
  } catch (err: any) {
    logger.error({ err }, "Failed to send campaign failure email");
  }
}

// ─── Direct reply ──────────────────────────────────────────────────────────
export async function sendDirectReply(
  toEmail: string,
  subject: string,
  htmlBody: string
): Promise<void> {
  // Sent synchronously (the admin is waiting for the result) but still logged
  try {
    const { error } = await sendNow("directReply", { from: getFromAddress(), to: [toEmail], subject, html: htmlBody });
    if (error) {
      logger.error({ err: error }, "Resend Direct Reply Error");
      throw new Error(error);
    }
  } catch (err: any) {
    logger.error({ err }, "Failed to send direct reply");
    throw new Error(err.message || "Failed to send reply");
  }
}

// ─── Proposal email (sent to client when admin creates a proposal) ─────────
export async function sendProposalEmail(data: {
  clientName:    string;
  clientEmail:   string;
  proposalTitle: string;
  introduction:  string;
  totalAmount:   string;
  milestones:    { title: string; amount: string }[];
  proposalUrl:   string;
  expiresAt:     string;
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  const brand   = getBrandName();
  const website = getBrandWebsite();
  const appUrl  = getFrontendUrl();

  const milestonesHtml = e.milestones.map((m, i) => `
    <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2a2a2a;">
      <span style="color:#d4d4d4;font-size:13px;">Milestone ${i + 1}: ${m.title}</span>
      <span style="color:#f97316;font-size:13px;font-weight:700;">${m.amount}</span>
    </div>`).join("");

  try {
    const { error } = await outbox("proposalEmail").send({
      from: getFromAddress(),
      to: [data.clientEmail],
      subject: `📋 Proposal from ${brand} — ${data.proposalTitle}`,
      html: `
        <div style="font-family:'Segoe UI',sans-serif;background:#0f0f0f;padding:40px 20px;min-height:100vh;">
          <div style="max-width:580px;margin:0 auto;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#f97316,#fb923c);padding:32px;text-align:center;">
              <p style="color:rgba(255,255,255,0.8);font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px;">${brand}</p>
              <h1 style="color:#fff;font-size:26px;font-weight:800;margin:0;">Project Proposal</h1>
              <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0;">${e.proposalTitle}</p>
            </div>
            <div style="padding:32px;">
              <p style="color:#d4d4d4;font-size:15px;line-height:1.7;margin:0 0 24px;">
                Hi ${e.clientName || "there"},<br><br>
                ${e.introduction || `Thank you for submitting your project request. We've reviewed your requirements and prepared a detailed proposal tailored to your needs. Please take a moment to review and let us know how you'd like to proceed.`}
              </p>
              <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:20px;margin-bottom:24px;">
                <p style="color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Payment Milestones</p>
                ${milestonesHtml}
                <div style="display:flex;justify-content:space-between;padding:14px 0 2px;">
                  <span style="color:#888;font-size:14px;font-weight:700;">Total Investment</span>
                  <span style="color:#f97316;font-size:22px;font-weight:800;">${e.totalAmount}</span>
                </div>
              </div>
              <div style="background:#1a1a1a;border:1px solid #f97316/30;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
                <p style="color:#f59e0b;font-size:12px;margin:0;">⏰ This proposal expires on <strong>${e.expiresAt}</strong></p>
              </div>
              <div style="text-align:center;margin-bottom:24px;">
                <a href="${e.proposalUrl}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#fb923c);color:#fff;font-weight:800;font-size:16px;padding:16px 44px;border-radius:12px;text-decoration:none;">
                  Review Proposal →
                </a>
              </div>
              <p style="color:#555;font-size:12px;text-align:center;line-height:1.6;">
                You can accept the proposal, request changes, or <a href="${appUrl}/contact" style="color:#f97316;">contact us directly</a>.
              </p>
            </div>
            <div style="border-top:1px solid #2a2a2a;padding:16px 32px;text-align:center;">
              <p style="color:#555;font-size:11px;margin:0;">© ${new Date().getFullYear()} ${brand} · ${website}</p>
            </div>
          </div>
        </div>`,
    });
    if (error) logger.error({ err: error }, "Resend Proposal Email Error");
  } catch (err: any) {
    logger.error({ err }, "Failed to send proposal email");
  }
}

// ─── Changes requested notification (admin) ────────────────────────────────
export async function sendChangesRequestedNotification(data: {
  clientName:   string;
  clientEmail:  string;
  projectTitle: string;
  clientNote:   string;
  adminUrl:     string;
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    const { error } = await outbox("changesRequestedNotification").send({
      from: getFromAddress(),
      to: [getAdminEmail()],
      subject: `[${getBrandName()}] Proposal Changes Requested — ${data.projectTitle}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#f97316;">📝 Client Requested Changes</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;font-weight:bold;">Client</td><td style="padding:8px;">${e.clientName}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;"><a href="mailto:${e.clientEmail}">${e.clientEmail}</a></td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Project</td><td style="padding:8px;">${e.projectTitle}</td></tr>
          </table>
          <div style="margin-top:16px;padding:16px;background:#fef3c7;border-radius:8px;border-left:4px solid #f59e0b;">
            <p style="font-weight:bold;margin:0 0 8px;">Client's requested changes:</p>
            <p style="margin:0;white-space:pre-wrap;">${e.clientNote}</p>
          </div>
          <p style="margin-top:16px;color:#6b7280;font-size:12px;">Review in <a href="${e.adminUrl}">Admin Dashboard</a> and revise the proposal.</p>
        </div>`,
    });
    if (error) logger.error({ err: error }, "Resend Changes Notification Error");
  } catch (err: any) {
    logger.error({ err }, "Failed to send changes notification");
  }
}

// ─── Contract email (sent to client after accepting proposal) ──────────────
export async function sendContractEmail(data: {
  clientName:   string;
  clientEmail:  string;
  projectTitle: string;
  totalAmount:  string;
  contractUrl:  string;
  expiresAt:    string;
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  const brand   = getBrandName();
  const website = getBrandWebsite();
  const appUrl  = getFrontendUrl();

  try {
    const { error } = await outbox("contractEmail").send({
      from: getFromAddress(),
      to: [data.clientEmail],
      subject: `📄 Service Agreement Ready — ${data.projectTitle} | ${brand}`,
      html: `
        <div style="font-family:'Segoe UI',sans-serif;background:#0f0f0f;padding:40px 20px;min-height:100vh;">
          <div style="max-width:580px;margin:0 auto;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <p style="color:rgba(255,255,255,0.8);font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px;">${brand}</p>
              <h1 style="color:#fff;font-size:26px;font-weight:800;margin:0;">Service Agreement</h1>
              <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0;">Ready for your digital signature</p>
            </div>
            <div style="padding:32px;">
              <p style="color:#d4d4d4;font-size:15px;line-height:1.7;margin:0 0 24px;">
                Hi ${e.clientName || "there"},<br><br>
                You've accepted our proposal for <strong style="color:#fff;">${e.projectTitle}</strong>. 
                We've prepared your service agreement outlining all project commitments, milestones, and deliverables.
                Please review and sign to officially kick off your project.
              </p>
              <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:20px;margin-bottom:24px;">
                <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2a2a2a;">
                  <span style="color:#888;font-size:13px;">Project</span>
                  <span style="color:#fff;font-size:13px;font-weight:600;">${e.projectTitle}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2a2a2a;">
                  <span style="color:#888;font-size:13px;">Contract Expires</span>
                  <span style="color:#f59e0b;font-size:13px;font-weight:600;">${e.expiresAt}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:14px 0 2px;">
                  <span style="color:#888;font-size:14px;font-weight:700;">Total Project Value</span>
                  <span style="color:#a78bfa;font-size:22px;font-weight:800;">${e.totalAmount}</span>
                </div>
              </div>
              <div style="background:#1e1b4b;border:1px solid #6366f1;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
                <p style="color:#a5b4fc;font-size:13px;margin:0;">✍️ Simply type your full name in the signature field and click "Sign" — no download needed.</p>
              </div>
              <div style="text-align:center;margin-bottom:24px;">
                <a href="${e.contractUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:800;font-size:16px;padding:16px 44px;border-radius:12px;text-decoration:none;">
                  Review &amp; Sign Contract →
                </a>
              </div>
              <p style="color:#555;font-size:12px;text-align:center;line-height:1.6;">
                Questions? <a href="${appUrl}/contact" style="color:#f97316;">Contact us</a> before signing.
              </p>
            </div>
            <div style="border-top:1px solid #2a2a2a;padding:16px 32px;text-align:center;">
              <p style="color:#555;font-size:11px;margin:0;">© ${new Date().getFullYear()} ${brand} · ${website}</p>
            </div>
          </div>
        </div>`,
    });
    if (error) logger.error({ err: error }, "Resend Contract Email Error");
  } catch (err: any) {
    logger.error({ err }, "Failed to send contract email");
  }
}

// ─── Contract signed notification (admin) ──────────────────────────────────
export async function sendContractSignedNotification(data: {
  clientName:   string;
  clientEmail:  string;
  projectTitle: string;
  signedAt:     string;
  adminUrl:     string;
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    const { error } = await outbox("contractSignedNotification").send({
      from: getFromAddress(),
      to: [getAdminEmail()],
      subject: `✅ Contract Signed — ${data.projectTitle} | ${getBrandName()}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#10b981;">✅ Contract Signed — Invoice Can Now Be Created</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;font-weight:bold;">Client</td><td style="padding:8px;">${e.clientName}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;"><a href="mailto:${e.clientEmail}">${e.clientEmail}</a></td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Project</td><td style="padding:8px;">${e.projectTitle}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Signed On</td><td style="padding:8px;">${e.signedAt}</td></tr>
          </table>
          <div style="margin-top:16px;padding:16px;background:#d1fae5;border-radius:8px;border-left:4px solid #10b981;">
            <p style="font-weight:bold;margin:0;color:#065f46;">🚀 Next step: Create the first milestone invoice in the Admin Dashboard.</p>
          </div>
          <p style="margin-top:16px;color:#6b7280;font-size:12px;"><a href="${e.adminUrl}">Go to Admin Dashboard →</a></p>
        </div>`,
    });
    if (error) logger.error({ err: error }, "Resend Contract Signed Error");
  } catch (err: any) {
    logger.error({ err }, "Failed to send contract signed notification");
  }
}
// ─── Tracker: Completion sign-off request to client ──────────────────────────
export async function sendTrackerCompletionRequestEmail(data: {
  clientEmail: string;
  clientName: string;
  projectTitle: string;
  portalUrl: string;
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    const { error } = await outbox("trackerCompletionRequestEmail").send({
      from: getFromAddress(),
      to: [data.clientEmail],
      subject: `✅ Your Project is Ready for Final Sign-Off — ${data.projectTitle}`,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#f3f4f6;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#16a34a,#065f46);padding:40px 32px;text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">🎉</div>
            <h1 style="margin:0;font-size:26px;font-weight:800;color:#fff;">Project Ready for Sign-Off</h1>
            <p style="margin:8px 0 0;color:#bbf7d0;font-size:15px;">${getBrandName()}</p>
          </div>
          <div style="padding:36px 32px;">
            <p style="font-size:16px;line-height:1.7;margin:0 0 20px;">Hi ${e.clientName},</p>
            <p style="font-size:16px;line-height:1.7;margin:0 0 24px;">
              Great news! The team has completed all deliverables for <strong>${e.projectTitle}</strong> and is requesting your final approval to officially close this project.
            </p>
            <div style="background:#1a1a1a;border:1px solid #16a34a;border-radius:12px;padding:20px;margin-bottom:28px;">
              <p style="margin:0;font-size:14px;color:#86efac;font-weight:700;text-transform:uppercase;letter-spacing:1px;">What happens next?</p>
              <p style="margin:8px 0 0;font-size:14px;color:#d1d5db;line-height:1.6;">Visit your project portal and click <strong>"Approve & Complete Project"</strong>. By approving, you confirm that all deliverables meet your expectations.</p>
            </div>
            <div style="text-align:center;margin:32px 0;">
              <a href="${e.portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;text-decoration:none;padding:16px 40px;border-radius:50px;font-weight:800;font-size:16px;box-shadow:0 8px 24px rgba(22,163,74,0.4);">
                ✅ Review & Approve Project
              </a>
            </div>
            <p style="font-size:13px;color:#6b7280;text-align:center;">Thank you for working with us. It's been a pleasure building this for you.</p>
          </div>
          <div style="padding:20px 32px;border-top:1px solid #1f2937;text-align:center;">
            <p style="margin:0;font-size:12px;color:#374151;">© ${getBrandName()} · <a href="${getBrandWebsite()}" style="color:#16a34a;">${getBrandWebsite()}</a></p>
          </div>
        </div>`,
    });
    if (error) logger.error({ err: error }, "Resend Completion Request Error");
  } catch (err: any) {
    logger.error({ err }, "Failed to send completion request email");
  }
}

// ─── Tracker: Completion approved — notify admin ──────────────────────────────
export async function sendTrackerCompletionApprovedEmail(data: {
  projectTitle: string;
  clientName: string;
  adminUrl: string;
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    const { error } = await outbox("trackerCompletionApprovedEmail").send({
      from: getFromAddress(),
      to: [getAdminEmail()],
      subject: `🏆 Project Completed & Approved — ${data.projectTitle}`,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#f3f4f6;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#7c3aed,#4c1d95);padding:40px 32px;text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">🏆</div>
            <h1 style="margin:0;font-size:26px;font-weight:800;color:#fff;">Project Officially Completed!</h1>
            <p style="margin:8px 0 0;color:#ddd6fe;font-size:15px;">${getBrandName()} Admin</p>
          </div>
          <div style="padding:36px 32px;">
            <div style="background:#1a1a1a;border:1px solid #7c3aed;border-radius:12px;padding:20px;margin-bottom:28px;">
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px;font-weight:bold;color:#a78bfa;">Project</td><td style="padding:8px;color:#f3f4f6;">${e.projectTitle}</td></tr>
                <tr style="background:#0f0f0f;"><td style="padding:8px;font-weight:bold;color:#a78bfa;">Client</td><td style="padding:8px;color:#f3f4f6;">${e.clientName}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;color:#a78bfa;">Completed On</td><td style="padding:8px;color:#f3f4f6;">${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}</td></tr>
              </table>
            </div>
            <div style="text-align:center;margin:28px 0;">
              <a href="${e.adminUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-weight:700;font-size:15px;">
                View in Admin Dashboard →
              </a>
            </div>
          </div>
        </div>`,
    });
    if (error) logger.error({ err: error }, "Resend Completion Approved Error");
  } catch (err: any) {
    logger.error({ err }, "Failed to send completion approved email");
  }
}

// ─── Signed Contract: Send docx attachment to both parties ───────────────────
export async function sendSignedContractEmail(data: {
  clientEmail: string;
  clientName: string;
  adminEmail: string;
  projectTitle: string;
  signedAt: string;
  docxBuffer: Buffer;
  filename: string;
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  const subject = `📄 Signed Contract — ${data.projectTitle}`;
  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#f3f4f6;border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:40px 32px;text-align:center;">
        <div style="font-size:48px;margin-bottom:12px;">📄</div>
        <h1 style="margin:0;font-size:24px;font-weight:800;color:#fff;">Your Contract is Signed</h1>
        <p style="margin:8px 0 0;color:#fed7aa;font-size:15px;">${getBrandName()}</p>
      </div>
      <div style="padding:36px 32px;">
        <p style="font-size:16px;line-height:1.7;margin:0 0 20px;">Hi ${e.clientName},</p>
        <p style="font-size:15px;line-height:1.7;margin:0 0 20px;">
          This email confirms that the contract for <strong>${e.projectTitle}</strong> has been digitally signed on <strong>${e.signedAt}</strong>.
        </p>
        <div style="background:#1a1a1a;border:1px solid #f97316;border-radius:12px;padding:20px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:14px;color:#fb923c;font-weight:700;">📎 Attachment</p>
          <p style="margin:0;font-size:14px;color:#d1d5db;">The signed contract document is attached to this email as a Word document (.docx). Please save it for your records.</p>
        </div>
        <p style="font-size:13px;color:#6b7280;text-align:center;">Thank you for choosing ${getBrandName()}. We're excited to begin!</p>
      </div>
    </div>`;

  const attachmentContent = data.docxBuffer.toString("base64");

  try {
    // Send to client
    await outbox("signedContractEmail").send({
      from: getFromAddress(),
      to: [data.clientEmail],
      subject,
      html,
      attachments: [{ filename: data.filename, content: attachmentContent }],
    });
    // Send to admin
    await outbox("signedContractEmail").send({
      from: getFromAddress(),
      to: [data.adminEmail],
      subject: `[Admin Copy] ${subject}`,
      html,
      attachments: [{ filename: data.filename, content: attachmentContent }],
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to send signed contract email");
  }
}

// ─── Newsletter: Double Opt-In Confirmation Email ──────────────────────────
// Sent immediately after signup when NEWSLETTER_DOUBLE_OPTIN=true.
// The subscriber must click the link to activate their subscription.
export async function sendNewsletterConfirmationEmail(data: {
  name: string;
  email: string;
  confirmUrl: string; // [FRONTEND_URL]/newsletter/confirm/[token]
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    const brand = getBrandName();
    const { error } = await outbox("newsletterConfirmationEmail").send({
      from: getFromAddress(),
      to: [data.email],
      subject: `Confirm your subscription to ${brand}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:32px 40px;">
            <h1 style="color:#fff;margin:0;font-size:24px;">Confirm Your Subscription</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">${brand}</p>
          </div>
          <div style="padding:32px 40px;">
            <p style="font-size:16px;color:#374151;margin:0 0 16px;">Hi ${e.name},</p>
            <p style="font-size:15px;color:#374151;line-height:1.6;">
              Thanks for subscribing! To complete your signup and start receiving our updates,
              please confirm your email address by clicking the button below.
            </p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${e.confirmUrl}"
                 style="display:inline-block;background:#f97316;color:#fff;padding:14px 32px;
                        border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;">
                Confirm My Subscription
              </a>
            </div>
            <p style="font-size:13px;color:#6b7280;line-height:1.6;">
              This link expires in <strong>24 hours</strong>. If you did not subscribe, you can safely ignore this email.
            </p>
            <p style="font-size:12px;color:#9ca3af;margin-top:8px;">
              Or copy this URL into your browser:<br/>
              <span style="color:#f97316;word-break:break-all;">${e.confirmUrl}</span>
            </p>
          </div>
          <div style="background:#f9fafb;padding:16px 40px;text-align:center;">
            <p style="font-size:12px;color:#9ca3af;margin:0;">
              &copy; ${new Date().getFullYear()} ${brand}. You received this because you subscribed at ${getBrandWebsite()}.
            </p>
          </div>
        </div>
      `,
    });
    if (error) logger.error({ err: error }, "Resend Error (newsletter confirmation)");
  } catch (err: any) {
    logger.error({ err }, "Failed to send newsletter confirmation email");
  }
}

// ─── Newsletter: Welcome Email (sent after double opt-in is confirmed) ─────
export async function sendNewsletterWelcomeEmail(data: {
  name: string;
  email: string;
  interest: string;
}): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    const brand = getBrandName();
    const frontendUrl = getFrontendUrl();
    const { error } = await outbox("newsletterWelcomeEmail").send({
      from: getFromAddress(),
      to: [data.email],
      subject: `Welcome to ${brand} — you're now subscribed!`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:32px 40px;">
            <h1 style="color:#fff;margin:0;font-size:24px;">You're Subscribed! &#127881;</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">${brand}</p>
          </div>
          <div style="padding:32px 40px;">
            <p style="font-size:16px;color:#374151;margin:0 0 16px;">Hi ${e.name},</p>
            <p style="font-size:15px;color:#374151;line-height:1.6;">
              Your subscription has been confirmed. You'll now receive our latest updates,
              insights, and news on <strong>${e.interest}</strong>.
            </p>
            <div style="margin:24px 0;padding:20px;background:#fff7ed;border-left:4px solid #f97316;border-radius:4px;">
              <p style="margin:0;color:#374151;font-size:14px;">
                Want to explore what we do? Visit our website to see our services and portfolio.
              </p>
            </div>
            <div style="text-align:center;margin:32px 0;">
              <a href="${frontendUrl}"
                 style="display:inline-block;background:#f97316;color:#fff;padding:14px 32px;
                        border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;">
                Visit ${brand}
              </a>
            </div>
          </div>
          <div style="background:#f9fafb;padding:16px 40px;text-align:center;">
            <p style="font-size:12px;color:#9ca3af;margin:0;">
              &copy; ${new Date().getFullYear()} ${brand}. You subscribed at ${getBrandWebsite()}.
            </p>
          </div>
        </div>
      `,
    });
    if (error) logger.error({ err: error }, "Resend Error (newsletter welcome)");
  } catch (err: any) {
    logger.error({ err }, "Failed to send newsletter welcome email");
  }
}

// ─── Admin password reset ──────────────────────────────────────────────────
export async function sendPasswordResetEmail(data: { email: string; name: string; resetUrl: string }): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    const { error } = await outbox("passwordResetEmail").send({
      from: getFromAddress(),
      to: [data.email],
      subject: `Reset your ${getBrandName()} admin password`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <p>Hi ${e.name},</p>
          <p>Someone asked to reset the password for your admin account. If it was you, use the link below within 30 minutes:</p>
          <p><a href="${e.resetUrl}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset password</a></p>
          <p style="color:#6b7280;font-size:13px;">If you didn't ask for this, you can ignore this email — your password stays the same.</p>
        </div>
      `,
    });
    if (error) logger.error({ err: error }, "Resend Password Reset Error");
  } catch (err: any) {
    logger.error({ err }, "Failed to send password reset email");
  }
}

// ─── Admin alert (payment problems, disputes) ──────────────────────────────
export async function sendAdminAlert(data: { subject: string; message: string; adminUrl?: string }): Promise<void> {
  const e = escapeFields(data); // HTML-safe copy for the email body (subjects use raw data)
  try {
    const { error } = await outbox("adminAlert").send({
      from: getFromAddress(),
      to: [getAdminEmail()],
      subject: `[${getBrandName()}] ${data.subject}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">${e.subject}</h2>
          <p style="white-space: pre-wrap;">${e.message}</p>
          ${e.adminUrl ? `<p><a href="${e.adminUrl}">Open in the admin dashboard</a></p>` : ""}
        </div>
      `,
    });
    if (error) logger.error({ err: error }, "Resend Admin Alert Error");
  } catch (err: any) {
    logger.error({ err }, "Failed to send admin alert");
  }
}
