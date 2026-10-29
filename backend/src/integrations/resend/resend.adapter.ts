import { Resend } from "resend";
import { getSetting } from "../../lib/configLoader";
import { emailSends } from "../../lib/metrics";

/** Counts every Resend call by outcome (Resend reports most failures as { error }, not a throw). */
function counted<T extends { error?: unknown }>(kind: "single" | "batch", send: (payload: any) => Promise<T>) {
  return async (payload: any): Promise<T> => {
    try {
      const res = await send(payload);
      emailSends.inc({ kind, result: res?.error ? "error" : "ok" });
      return res;
    } catch (err) {
      emailSends.inc({ kind, result: "error" });
      throw err;
    }
  };
}

export class ResendAdapter {
  private getClient(): Resend {
    const apiKey = getSetting("RESEND_API_KEY");
    return new Resend(apiKey || "re_dummy_key");
  }

  public get emails(): any {
    const client = this.getClient();
    return { send: counted("single", (payload: any) => client.emails.send(payload)) };
  }

  public get batch(): any {
    const client = this.getClient();
    return { send: counted("batch", (payload: any) => client.batch.send(payload)) };
  }

  async sendEmail(params: {
    to: string | string[];
    subject: string;
    html: string;
    from: string;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const res = await this.emails.send({
        from: params.from,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
      });

      if (res.error) {
        return { success: false, error: res.error.message };
      }
      return { success: true, id: res.data?.id };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to send email" };
    }
  }

  async sendBatchEmails(
    emails: Array<{ to: string[]; subject: string; html: string; from: string }>
  ): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const payload = emails.map((e) => ({
        from: e.from,
        to: e.to,
        subject: e.subject,
        html: e.html,
      }));

      const res = await this.batch.send(payload);
      if (res.error) {
        return { success: false, count: 0, error: res.error.message };
      }
      return { success: true, count: payload.length };
    } catch (err: any) {
      return { success: false, count: 0, error: err.message || "Batch delivery failed" };
    }
  }
}

export const resendAdapter = new ResendAdapter();
