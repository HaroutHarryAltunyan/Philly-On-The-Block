import { sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { customers, orders } from "../../../../db/schema";
import { toErrorResponse } from "../../../../lib/admin-routes";
import { crossOriginResponse, isCrossOrigin } from "../../../../lib/csrf";
import { customerFromRequest } from "../../../../lib/customer-auth";
import { getCustomerPoints, normalizePhone, pointsToCents } from "../../../../lib/points";

const NAME_RE = /^[\p{L}\p{M}0-9 .,'’-]{0,60}$/u;

function unauthorized() {
  return Response.json({ error: "Sign in to see your account." }, { status: 401 });
}

type StoredLine = { name?: string; quantity?: number; options?: string[] };

export async function GET(request: Request) {
  try {
    const db = getDb();
    const customer = await customerFromRequest(db, request);
    if (!customer) return unauthorized();

    // Orders placed while signed in, plus earlier guest orders that used this
    // account's (verified) email. Delivery addresses and notes are left out.
    const rows = await db
      .select({
        orderNumber: orders.orderNumber,
        fulfillment: orders.fulfillment,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        items: orders.items,
        totalCents: orders.totalCents,
        pointsEarned: orders.pointsEarned,
        pointsRedeemed: orders.pointsRedeemed,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(
        sql`${orders.customerId} = ${customer.id} OR (${orders.customerId} IS NULL AND ${orders.email} = ${customer.email})`,
      )
      .orderBy(sql`${orders.createdAt} DESC`, sql`${orders.id} DESC`)
      .limit(50);

    const points = customer.phoneKey ? await getCustomerPoints(db, customer.phoneKey) : null;

    return Response.json({
      customer: { email: customer.email, name: customer.name, phone: customer.phone },
      points: points
        ? {
            balance: points.balance,
            pointsValueCents: pointsToCents(points.balance),
            lifetimeEarned: points.lifetimeEarned,
            lifetimeRedeemed: points.lifetimeRedeemed,
          }
        : null,
      orders: rows.map((row) => {
        let lines: StoredLine[] = [];
        try {
          lines = JSON.parse(row.items) as StoredLine[];
        } catch {
          // malformed legacy row: show the order without its lines
        }
        return {
          orderNumber: row.orderNumber,
          fulfillment: row.fulfillment,
          status: row.status,
          paymentStatus: row.paymentStatus,
          totalCents: row.totalCents,
          pointsEarned: row.pointsEarned,
          pointsRedeemed: row.pointsRedeemed,
          createdAt: row.createdAt,
          items: lines.map((line) => ({
            name: String(line.name ?? ""),
            quantity: Number(line.quantity) || 1,
            options: Array.isArray(line.options) ? line.options.map(String) : [],
          })),
        };
      }),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    if (isCrossOrigin(request)) return crossOriginResponse();
    const db = getDb();
    const customer = await customerFromRequest(db, request);
    if (!customer) return unauthorized();

    const payload = (await request.json().catch(() => ({}))) as { name?: unknown; phone?: unknown };
    const name = typeof payload.name === "string" ? payload.name.trim() : customer.name;
    const phone = typeof payload.phone === "string" ? payload.phone.trim() : customer.phone;
    if (!NAME_RE.test(name)) {
      return Response.json({ error: "Use letters, numbers, and basic punctuation for your name." }, { status: 400 });
    }
    const phoneKey = normalizePhone(phone);
    if (phone && phoneKey.length !== 10) {
      return Response.json({ error: "Enter a 10-digit US phone number." }, { status: 400 });
    }

    await db
      .update(customers)
      .set({ name, phone: phone ? phone.slice(0, 20) : "", phoneKey: phone ? phoneKey : "" })
      .where(sql`${customers.id} = ${customer.id}`);
    return Response.json({ saved: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
