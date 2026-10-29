import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import ContactMessage from "../models/ContactMessage";
import AuditLog from "../models/AuditLog";
import * as email from "../services/email";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";


describe("POST /v1/contact/reply (N-BR-4)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("replies to the stored sender only, escapes the body and audits it", async () => {
    const send = vi.spyOn(email, "sendDirectReply").mockResolvedValue();
    const msg = await ContactMessage.create({ name: "Ada", email: "ada@client.test", subject: "Hi", message: "Question" });

    const res = await request(app)
      .post("/v1/contact/reply")
      .set("Authorization", `Bearer ${await staffToken("admin")}`)
      .send({ messageId: msg._id.toString(), toEmail: "victim@elsewhere.test", subject: "Re: Hi", body: "Line 1\n<b>Line 2</b>" });

    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const [to, subject, html] = send.mock.calls[0];
    expect(to).toBe("ada@client.test"); // never the toEmail from the request
    expect(subject).toBe("Re: Hi");
    expect(html).toContain("Line 1<br>&lt;b&gt;Line 2&lt;/b&gt;");
    expect(await AuditLog.countDocuments({ action: "reply", entityId: msg._id.toString() })).toBe(1);
  });

  it("refuses to send without a stored message to reply to", async () => {
    const send = vi.spyOn(email, "sendDirectReply").mockResolvedValue();
    const auth = { Authorization: `Bearer ${await staffToken("admin")}` };

    const noId = await request(app).post("/v1/contact/reply").set(auth).send({ toEmail: "victim@elsewhere.test", subject: "x", body: "y" });
    expect(noId.status).toBe(400);

    const unknownId = await request(app).post("/v1/contact/reply").set(auth).send({ messageId: "507f1f77bcf86cd799439099", subject: "x", body: "y" });
    expect(unknownId.status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  it("is admin-only", async () => {
    const res = await request(app)
      .post("/v1/contact/reply")
      .set("Authorization", `Bearer ${await staffToken("viewer")}`)
      .send({ messageId: "507f1f77bcf86cd799439011", subject: "x", body: "y" });
    expect(res.status).toBe(403);
  });
});
