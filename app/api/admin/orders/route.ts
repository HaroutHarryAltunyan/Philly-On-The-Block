import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { orders } from "../../../../db/schema";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";
import { AuthError, requireAdmin, toErrorResponse } from "../../../../lib/admin-routes";
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

export async function GET(request: Request) {
  try {
    const db = await requireAdmin(request).catch(() => null);

    if (!db) {
      const driverDb = getDb();
      await ensureBootstrap(driverDb);
      const driver = await getActiveDriverFromRequest(request, driverDb);
      if (!driver) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
      }
      const rows = await driverDb
        .select()
        .from(orders)
        .where(sql`${orders.fulfillment} = 'delivery'`)
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(100);

      return Response.json({
        orders: withDriverLocationFallback(rows).map((order) => ({
          ...order,
          items: JSON.parse(order.items) as unknown,
        })),
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
    return toErrorResponse(error);
  }
}
