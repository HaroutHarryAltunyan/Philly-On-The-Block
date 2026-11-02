import { offersForDriver, runDispatch } from "@/lib/dispatch";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { orders } from "../../../../db/schema";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";
import { AuthError, toErrorResponse, ForbiddenError, requireStaff } from "../../../../lib/admin-routes";
import { parseCoordinatePair } from "@/lib/tracking";

type OrderRow = typeof orders.$inferSelect;

// A driver's GPS lives on whichever order they last shared from. Orders that
// were assigned to the driver after that still carry empty driver coords, so
// backfill them with the driver's most recent position across their orders.
function withDriverLocationFallback(rows: OrderRow[]): OrderRow[] {
  const latestByDriver = new Map<number, { lat: string; lng: string; updatedAt: Date | null }>();
  for (const row of rows) {
    if (row.driverId == null) continue;
    if (!parseCoordinatePair(row.driverLat, row.driverLng)) continue;
    const current = latestByDriver.get(row.driverId);
    const rowTime = row.driverUpdatedAt?.getTime() ?? 0;
    if (!current || rowTime >= (current.updatedAt?.getTime() ?? 0)) {
      latestByDriver.set(row.driverId, {
        lat: row.driverLat,
        lng: row.driverLng,
        updatedAt: row.driverUpdatedAt,
      });
    }
  }
  return rows.map((row) => {
    const fallback = row.driverId != null ? latestByDriver.get(row.driverId) : undefined;
    if (fallback && !parseCoordinatePair(row.driverLat, row.driverLng)) {
      return { ...row, driverLat: fallback.lat, driverLng: fallback.lng, driverUpdatedAt: fallback.updatedAt };
    }
    return row;
  });
}

// What a driver may see about an order before accepting it: enough to decide
// (area, size, total, timing), nothing that identifies or locates the customer.
function redactForUnassignedDriver(order: OrderRow) {
  const parts = order.address.split(",").map((part) => part.trim()).filter(Boolean);
  const area = parts.length > 1 ? parts.slice(1).join(", ") : "";
  const round = (value: string) => (value && Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "");
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    name: "",
    phone: "",
    email: "",
    address: area,
    notes: "",
    fulfillment: order.fulfillment,
    items: JSON.parse(order.items) as unknown,
    subtotalCents: order.subtotalCents,
    serviceFeeCents: order.serviceFeeCents,
    deliveryFeeCents: order.deliveryFeeCents,
    taxCents: order.taxCents,
    discountCents: order.discountCents,
    couponCode: "",
    totalCents: order.totalCents,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    driverId: null,
    // ~1 km precision: shows the neighborhood on a map, not the house.
    destLat: round(order.destLat),
    destLng: round(order.destLng),
    driverLat: "",
    driverLng: "",
    driverUpdatedAt: null,
    deliveryPin: "",
    pointsEarned: 0,
    pointsRedeemed: 0,
    pointsDiscountCents: 0,
    paidAt: null,
    createdAt: order.createdAt,
    redacted: true,
  };
}

export async function GET(request: Request) {
  try {
    const db = (await requireStaff(request).catch(() => null))?.db ?? null;

    if (!db) {
      const driverDb = getDb();
      await ensureBootstrap(driverDb);
      const driver = await getActiveDriverFromRequest(request, driverDb);
      if (!driver) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
      }
      // Each driver poll doubles as a dispatch tick: expire stale offers and
      // offer waiting orders to the next driver.
      await runDispatch(driverDb).catch((error) => console.warn("dispatch tick failed", error));
      // Drivers get (a) their own orders in full and (b) unassigned delivery
      // orders they could claim, with customer identity and street address
      // withheld until they accept. Other drivers' orders are not returned.
      const rows = await driverDb
        .select()
        .from(orders)
        .where(
          sql`${orders.fulfillment} = 'delivery' AND (
            ${orders.driverId} = ${driver.id}
            OR (${orders.driverId} IS NULL AND ${orders.status} IN ('new', 'preparing', 'ready'))
          )`,
        )
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(100);

      return Response.json({
        offers: await offersForDriver(driverDb, driver.id),
        orders: withDriverLocationFallback(rows).map((order) =>
          order.driverId === driver.id
            ? { ...order, items: JSON.parse(order.items) as unknown }
            : redactForUnassignedDriver(order),
        ),
      });
    }

    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt), desc(orders.id)).limit(100);

    return Response.json({
      orders: withDriverLocationFallback(rows).map((order) => ({
        ...order,
        items: JSON.parse(order.items) as unknown,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    return toErrorResponse(error);
  }
}
