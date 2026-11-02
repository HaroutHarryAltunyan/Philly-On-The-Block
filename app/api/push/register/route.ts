import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { orders, pushTokens } from "@/db/schema";
import { readSessionCredential, readStaffSession, SESSION_COOKIE } from "@/lib/admin-auth";
import { toErrorResponse } from "@/lib/admin-routes";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";
import { normalizePhone } from "@/lib/points";
import { isExpoPushToken } from "@/lib/push";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

// Registers this device's Expo push token.
//   staff:    signed-in staff session            -> new-order alerts
//   driver:   signed-in driver session           -> offers / assignments
//   customer: { phone, orderNumber } of a real order (same proof as tracking)
//             -> status updates for that phone's orders
// DELETE with { token } unregisters (sign-out).
export async function POST(request: Request) {
  try {
    const db = getDb();
    await ensureBootstrap(db);
    const limited = await checkRateLimit(db, `push-register:${clientIp(request)}`, 30, 10 * 60 * 1000);
    if (!limited.allowed) return rateLimitResponse(limited) ?? Response.json({ error: "Too many requests" }, { status: 429 });

    const payload = (await request.json().catch(() => null)) as
      | { token?: string; kind?: string; phone?: string; orderNumber?: string }
      | null;
    if (!isExpoPushToken(payload?.token)) return Response.json({ error: "A valid Expo push token is required" }, { status: 400 });
    const token = payload!.token as string;

    let row: typeof pushTokens.$inferInsert;
    if (payload!.kind === "staff") {
      const staff = await readStaffSession(db, readSessionCredential(request, SESSION_COOKIE));
      if (!staff) return Response.json({ error: "Not authenticated" }, { status: 401 });
      row = { token, kind: "staff", driverId: null, phoneKey: "", updatedAt: new Date() };
    } else if (payload!.kind === "driver") {
      const driver = await getActiveDriverFromRequest(request, db);
      if (!driver) return Response.json({ error: "Not authenticated" }, { status: 401 });
      row = { token, kind: "driver", driverId: driver.id, phoneKey: "", updatedAt: new Date() };
    } else if (payload!.kind === "customer") {
      const phoneKey = normalizePhone(payload!.phone ?? "");
      const number = (payload!.orderNumber ?? "").trim().toUpperCase();
      const [order] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.orderNumber, number), eq(orders.phoneKey, phoneKey)))
        .limit(1);
      if (!phoneKey || !order) return Response.json({ error: "No order found with that number and phone" }, { status: 404 });
      row = { token, kind: "customer", driverId: null, phoneKey, updatedAt: new Date() };
    } else {
      return Response.json({ error: 'kind must be "staff", "driver" or "customer"' }, { status: 400 });
    }

    // A device belongs to whoever registered it last (e.g. a shared tablet).
    await db
      .insert(pushTokens)
      .values(row)
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { kind: row.kind, driverId: row.driverId ?? null, phoneKey: row.phoneKey ?? "", updatedAt: row.updatedAt },
      });
    return Response.json({ registered: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const db = getDb();
    await ensureBootstrap(db);
    const payload = (await request.json().catch(() => null)) as { token?: string } | null;
    if (!isExpoPushToken(payload?.token)) return Response.json({ error: "token required" }, { status: 400 });
    await db.delete(pushTokens).where(sql`${pushTokens.token} = ${payload!.token}`);
    return Response.json({ registered: false });
  } catch (error) {
    return toErrorResponse(error);
  }
}
