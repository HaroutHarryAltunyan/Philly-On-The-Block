import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { toErrorResponse } from "../../../../lib/admin-routes";
import { getCustomerPoints, pointsToCents } from "../../../../lib/points";
import { checkRateLimit, clientIp, rateLimitResponse } from "../../../../lib/rate-limit";

const LOOKUP_MAX_PER_WINDOW = 30;
const LOOKUP_WINDOW_MS = 10 * 60 * 1000;

// Points balance for a phone number (checkout uses it to offer redemption).
// Balance only: order history used to be returned here to anyone who typed a
// phone number; it now requires signing in (GET /api/account/me).
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const phone = url.searchParams.get("phone")?.trim() ?? "";

    if (!phone || phone.length > 20) {
      return Response.json({ error: "phone is required" }, { status: 400 });
    }

    const db = getDb();
    await ensureBootstrap(db);

    const limited = await checkRateLimit(db, `points:${clientIp(request)}`, LOOKUP_MAX_PER_WINDOW, LOOKUP_WINDOW_MS);
    if (!limited.allowed) {
      return rateLimitResponse(limited) ?? Response.json({ error: "Too many requests" }, { status: 429 });
    }

    const summary = await getCustomerPoints(db, phone);
    return Response.json({
      balance: summary.balance,
      pointsValueCents: pointsToCents(summary.balance),
      lifetimeEarned: summary.lifetimeEarned,
      lifetimeRedeemed: summary.lifetimeRedeemed,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
