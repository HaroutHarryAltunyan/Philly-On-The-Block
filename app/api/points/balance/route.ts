import { desc, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { orders } from "../../../../db/schema";
import { toErrorResponse } from "../../../../lib/admin-routes";
import { getCustomerPoints, phoneKey, pointsToCents } from "../../../../lib/points";
import { checkRateLimit, clientIp, rateLimitResponse } from "../../../../lib/rate-limit";

const LOOKUP_MAX_PER_WINDOW = 30;
const LOOKUP_WINDOW_MS = 10 * 60 * 1000;

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

    const key = phoneKey(phone);
    const summary = await getCustomerPoints(db, phone);

    const rows = await db
      .select()
      .from(orders)
      .where(sql`${orders.phoneKey} = ${key}`)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(20);

    const history = rows.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      fulfillment: order.fulfillment,
      status: order.status,
      paymentStatus: order.paymentStatus,
      subtotalCents: order.subtotalCents,
      totalCents: order.totalCents,
      pointsEarned: order.pointsEarned,
      pointsRedeemed: order.pointsRedeemed,
      pointsDiscountCents: order.pointsDiscountCents,
      createdAt: order.createdAt,
    }));

    return Response.json({
      balance: summary.balance,
      pointsValueCents: pointsToCents(summary.balance),
      lifetimeEarned: summary.lifetimeEarned,
      lifetimeRedeemed: summary.lifetimeRedeemed,
      history,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
