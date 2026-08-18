import { env } from "cloudflare:workers";

type WorkerEnv = {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_EMAIL_TOKEN?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
};

function emailApiUrl(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/send`;
}

// Keep each request small so a rate limit or one bad batch doesn't sink the
// whole announcement, and pause briefly between them.
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 250;

const FOOTER =
  "Philly on the Block · 2600 W Victory Blvd, Burbank, CA · (818) 406-6053 · phillyontheblock.com\n" +
  "You're getting this because you signed up for our updates. To stop receiving emails, call or text (818) 406-6053.";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linesToHtml(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

export function buildEmailContent(message: string): { text: string; html: string } {
  const text = `${message}\n\n${FOOTER}`;
  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f7f7f5;font-family:Arial,Helvetica,sans-serif;color:#16161a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e8e8e4;border-radius:8px;padding:24px;">
    <div style="font-size:15px;line-height:1.55;">${linesToHtml(message)}</div>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #efefec;font-size:12px;line-height:1.5;color:#5c6b7a;">${linesToHtml(FOOTER)}</div>
  </div>
</body>
</html>`;
  return { text, html };
}

export function isEmailConfigured(): boolean {
  const token = (env as unknown as WorkerEnv).CLOUDFLARE_EMAIL_TOKEN;
  const accountId = (env as unknown as WorkerEnv).CLOUDFLARE_ACCOUNT_ID;
  return (
    typeof token === "string" &&
    token.trim() !== "" &&
    typeof accountId === "string" &&
    accountId.trim() !== ""
  );
}

// Mail goes out from the restaurant's own domain (email sending must be
// enabled for it in the Cloudflare dashboard first). Accepts either a plain
// address or "Name <address>" for EMAIL_FROM.
function senderAddress(): { mailFrom: string; mailFromName: string } {
  const raw = (env as unknown as WorkerEnv).EMAIL_FROM?.trim() ?? "";
  const bracketed = raw.match(/<([^>]+)>/);
  const mailFrom = (bracketed ? bracketed[1] : raw).trim() || "hello@phillyontheblock.com";
  const mailFromName = (env as unknown as WorkerEnv).EMAIL_FROM_NAME?.trim() || "Philly on the Block";
  return { mailFrom, mailFromName };
}

async function sendBatch(
  url: string,
  headers: Record<string, string>,
  bodyRecord: Record<string, unknown>,
  batch: string[],
): Promise<number> {
  // Returns how many of the batch's recipients were accepted.
  const attempt = async (mailTo: Array<{ email: string }>): Promise<Response | null> => {
    try {
      return await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...bodyRecord, mail_to: mailTo }),
      });
    } catch (error) {
      console.error("Cloudflare email request failed", error);
      return null;
    }
  };

  const response = await attempt(batch.map((email) => ({ email })));
  if (!response) return 0;
  if (response.ok) return batch.length;

  if (response.status === 400) {
    // One rejected address (typo, blocked domain, …) fails the whole batch
    // with a 400, so retry one-by-one and keep the good recipients.
    let accepted = 0;
    for (const email of batch) {
      const single = await attempt([{ email }]);
      if (single?.ok) {
        accepted += 1;
      } else {
        console.warn(`Cloudflare email rejected recipient: ${email}`);
      }
    }
    return accepted;
  }

  console.error(`Cloudflare email batch failed (${response.status})`, await response.text());
  return 0;
}

export async function sendEmails(
  recipients: string[],
  subject: string,
  message: string,
): Promise<{ sent: number; failed: number }> {
  const accountId = (env as unknown as WorkerEnv).CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = (env as unknown as WorkerEnv).CLOUDFLARE_EMAIL_TOKEN?.trim();
  if (!accountId || !token) {
    throw new Error("Email sending is not configured");
  }

  const { mailFrom, mailFromName } = senderAddress();
  const { text, html } = buildEmailContent(message);
  const url = emailApiUrl(accountId);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const bodyRecord = {
    mail_from: mailFrom,
    mail_from_name: mailFromName,
    subject,
    text,
    html,
  };

  let sent = 0;
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    sent += await sendBatch(url, headers, bodyRecord, batch);
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return { sent, failed: recipients.length - sent };
}
