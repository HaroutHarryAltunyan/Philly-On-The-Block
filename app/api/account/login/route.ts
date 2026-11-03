import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { requestIsLocal } from "../../../../lib/admin-auth";
import { toErrorResponse } from "../../../../lib/admin-routes";
import { crossOriginResponse, isCrossOrigin } from "../../../../lib/csrf";
import { createLoginToken, LOGIN_TOKEN_TTL_MS, normalizeEmail } from "../../../../lib/customer-auth";
import { isEmailConfigured, sendTransactionalEmail } from "../../../../lib/email";
import { checkRateLimit, clientIp, rateLimitResponse } from "../../../../lib/rate-limit";
import { SITE_URL } from "../../../../lib/site";

const PER_IP_MAX = 10;
const PER_EMAIL_MAX = 5;
const WINDOW_MS = 15 * 60 * 1000;

// Emails a one-time sign-in link. The response is identical whether or not an
// account exists for the address (accounts are created on first sign-in), so
// this endpoint can't be used to discover who has an account.
export async function POST(request: Request) {
  try {
    if (isCrossOrigin(request)) return crossOriginResponse();
    const payload = (await request.json().catch(() => ({}))) as { email?: unknown };
    const email = normalizeEmail(payload.email);
    if (!email) return Response.json({ error: "Enter a valid email address." }, { status: 400 });

    const db = getDb();
    await ensureBootstrap(db);

    for (const key of [`account-login-ip:${clientIp(request)}`, `account-login-email:${email}`]) {
      const limited = await checkRateLimit(db, key, key.includes("-ip:") ? PER_IP_MAX : PER_EMAIL_MAX, WINDOW_MS);
      if (!limited.allowed) {
        return rateLimitResponse(limited) ?? Response.json({ error: "Too many requests" }, { status: 429 });
      }
    }

    const local = requestIsLocal(request);
    if (!isEmailConfigured() && !local) {
      return Response.json(
        { error: "Email sign-in isn’t available right now. Call (818) 406-6053 for help with your order or points." },
        { status: 503 },
      );
    }

    const token = await createLoginToken(db, email);
    // The token rides in the URL fragment: browsers never send fragments to
    // servers, so it can't leak into access logs or Referer headers, and
    // link scanners that prefetch the URL can't consume it.
    const origin = local ? new URL(request.url).origin : SITE_URL;
    const link = `${origin}/login/verify#token=${token}`;

    if (!isEmailConfigured()) {
      // Local development only: no mail provider, so hand the link back.
      return Response.json({ sent: true, devLink: link });
    }

    const minutes = Math.round(LOGIN_TOKEN_TTL_MS / 60_000);
    await sendTransactionalEmail(
      email,
      "Your Philly on the Block sign-in link",
      `Tap the link below to sign in to Philly on the Block. It works once and expires in ${minutes} minutes.\n\n${link}\n\nIf you didn’t ask for this, you can ignore this email.`,
    );
    return Response.json({ sent: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
