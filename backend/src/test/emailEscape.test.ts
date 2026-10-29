import { describe, it, expect, vi, beforeEach } from "vitest";
import { resendAdapter } from "../integrations/resend/resend.adapter";
import * as email from "../services/email";
import { updateSettingCache } from "../lib/configLoader";
import { escapeHtml, escapeFields } from "../lib/escapeHtml";

const HOSTILE = `<img src=x onerror="alert(1)"><a href="https://evil.test">Session expired – log in</a>`;
const sent: Array<{ subject: string; html: string; from: string }> = [];

beforeEach(() => {
  sent.length = 0;
  // Capture what would be handed to Resend instead of sending it
  vi.spyOn(resendAdapter, "emails", "get").mockReturnValue({
    send: async (msg: { subject: string; html: string; from: string }) => {
      sent.push(msg);
      return { data: { id: "test" }, error: null };
    },
  });
});

function expectEscaped() {
  expect(sent).toHaveLength(1);
  const { html } = sent[0];
  expect(html).not.toContain("<img src=x");
  expect(html).not.toContain('<a href="https://evil.test"');
  expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
}

describe("escape helpers", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });

  it("escapes nested strings but leaves Buffers, numbers and booleans alone", () => {
    const buf = Buffer.from("docx");
    const out = escapeFields({ a: "<b>", list: [{ t: "<i>" }], n: 3, ok: true, buf });
    expect(out).toEqual({ a: "&lt;b&gt;", list: [{ t: "&lt;i&gt;" }], n: 3, ok: true, buf });
    expect(out.buf).toBe(buf);
  });
});

describe("emails built from untrusted input are escaped (A12)", () => {
  it("contact form notification", async () => {
    await email.sendContactNotification({ name: HOSTILE, email: "a@b.test", company: HOSTILE, subject: HOSTILE, message: HOSTILE });
    expectEscaped();
    expect(sent[0].subject).toContain(HOSTILE); // subjects are plain text, not HTML
  });

  it("project request notification", async () => {
    await email.sendTaskNotification({
      name: HOSTILE, email: "a@b.test", company: HOSTILE, service: HOSTILE, budget: HOSTILE,
      priority: HOSTILE, projectTitle: HOSTILE, description: HOSTILE, selectedPlan: HOSTILE,
    });
    expectEscaped();
  });

  it("newsletter confirmation sent to a third-party address", async () => {
    updateSettingCache("NEWSLETTER_DOUBLE_OPTIN", "true");
    await email.sendNewsletterConfirmationEmail({ name: HOSTILE, email: "victim@b.test", confirmUrl: "https://suntrix.test/c/1" });
    expectEscaped();
    updateSettingCache("NEWSLETTER_DOUBLE_OPTIN", "");
  });

  it("client change request note", async () => {
    await email.sendChangesRequestedNotification({
      clientName: HOSTILE, clientEmail: "a@b.test", projectTitle: HOSTILE, clientNote: HOSTILE, adminUrl: "https://suntrix.test/admin",
    });
    expectEscaped();
  });

  it("proposal milestones", async () => {
    await email.sendProposalEmail({
      clientName: HOSTILE, clientEmail: "a@b.test", proposalTitle: HOSTILE, totalAmount: "$1",
      milestones: [{ title: HOSTILE, amount: "$1" }], proposalUrl: "https://suntrix.test/p/1", expiresAt: "2026-12-01",
    } as Parameters<typeof email.sendProposalEmail>[0]);
    expectEscaped();
  });

  it("uses one sender address: EMAIL_FROM when set, else name + address", async () => {
    updateSettingCache("EMAIL_FROM", "Acme <hello@acme.test>");
    expect(email.getFromAddress()).toBe("Acme <hello@acme.test>");
    updateSettingCache("EMAIL_FROM", "");
    expect(email.getFromAddress()).toMatch(/<.+@.+>/);
  });
});
