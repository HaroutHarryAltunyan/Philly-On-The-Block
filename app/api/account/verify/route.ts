import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { requestIsSecure, wantsNativeToken } from "../../../../lib/admin-auth";
import { toErrorResponse } from "../../../../lib/admin-routes";
import { crossOriginResponse, isCrossOrigin } from "../../../../lib/csrf";
import { consumeLoginToken, createCustomerSession, customerCookieHeader } from "../../../../lib/customer-auth";
import { checkRateLimit, clientIp, rateLimitResponse } from "../../../../lib/rate-limit";

export async function POST(request: Request) {
  try {
    if (isCrossOrigin(request)) return crossOriginResponse();
    const payload = (await request.json().catch(() => ({}))) as { token?: unknown };
    const token = typeof payload.token === "string" ? payload.token.trim() : "";

    const db = getDb();
    await ensureBootstrap(db);
    const limited = await checkRateLimit(db, `account-verify:${clientIp(request)}`, 20, 15 * 60 * 1000);
    if (!limited.allowed) {
      return rateLimitResponse(limited) ?? Response.json({ error: "Too many requests" }, { status: 429 });
    }

    const customer = await consumeLoginToken(db, token);
    if (!customer) {
      return Response.json(
        { error: "That sign-in link has expired or was already used. Request a new one." },
        { status: 400 },
      );
    }

    const session = await createCustomerSession(db, customer);
    return Response.json(
      { authenticated: true, ...(wantsNativeToken(request) ? { token: session } : {}) },
      { headers: { "Set-Cookie": customerCookieHeader(session, requestIsSecure(request)) } },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
