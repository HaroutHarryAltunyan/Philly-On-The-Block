import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureBootstrap } from "../../../db/bootstrap";
import { orders } from "../../../db/schema";
import { toErrorResponse } from "../../../lib/admin-routes";
import { checkRateLimit, clientIp, rateLimitResponse } from "../../../lib/rate-limit";

const LOOKUP_MAX_PER_WINDOW = 30;
const LOOKUP_WINDOW_MS = 10 * 60 * 1000;

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function toOrderJson(order: {
  id: number;
  orderNumber: string;
  name: string;
  fulfillment: string;
  items: string;
  subtotalCents: number;
  serviceFeeCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  discountCents: number;
  couponCode: string;
  totalCents: number;
  status: string;
  paymentStatus: string;
  createdAt: Date;
  phone: string;
  destLat: string;
  destLng: string;
  driverLat: string;
  driverLng: string;
  driverUpdatedAt: Date | null;
  pointsEarned: number;
  pointsRedeemed: number;
  pointsDiscountCents: number;
}) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    name: order.name,
    phone: order.phone,
    fulfillment: order.fulfillment,
    items: JSON.parse(order.items) as unknown,
    subtotalCents: order.subtotalCents,
    serviceFeeCents: order.serviceFeeCents,
    deliveryFeeCents: order.deliveryFeeCents,
    taxCents: order.taxCents,
    discountCents: order.discountCents,
    couponCode: order.couponCode,
    totalCents: order.totalCents,
    pointsEarned: order.pointsEarned,
    pointsRedeemed: order.pointsRedeemed,
    pointsDiscountCents: order.pointsDiscountCents,
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    destLat: order.destLat,
    destLng: order.destLng,
    driverLat: order.driverLat,
    driverLng: order.driverLng,
    driverUpdatedAt: order.driverUpdatedAt,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const number = url.searchParams.get("number")?.trim().toUpperCase() ?? "";
    const phone = url.searchParams.get("phone")?.trim() ?? "";

    if (!number && !phone) {
      return Response.json({ error: "order number or phone are required" }, { status: 400 });
    }

    const db = getDb();
    await ensureBootstrap(db);

    const limited = await checkRateLimit(db, `order-status:${clientIp(request)}`, LOOKUP_MAX_PER_WINDOW, LOOKUP_WINDOW_MS);
    if (!limited.allowed) {
      return rateLimitResponse(limited) ?? Response.json({ error: "Too many requests" }, { status: 429 });
    }

    const phoneKey = normalizePhone(phone);

    if (number) {
      const rows = await db
        .select()
        .from(orders)
        .where(and(eq(orders.orderNumber, number), eq(orders.phoneKey, phoneKey)))
        .limit(1);
      if (rows.length === 0) {
        return Response.json({ error: "No order found with that number and phone" }, { status: 404 });
      }
      return Response.json({ order: toOrderJson(rows[0]) });
    }

    if (!phoneKey) {
      return Response.json({ error: "order number or phone are required" }, { status: 400 });
    }

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recent = await db
      .select()
      .from(orders)
      .where(and(eq(orders.phoneKey, phoneKey), gte(orders.createdAt, cutoff)))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(10);

    return Response.json({ orders: recent.map(toOrderJson) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
