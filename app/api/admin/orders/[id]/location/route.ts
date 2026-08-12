import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { orders } from "@/db/schema";
import { parseCoordinatePair } from "@/lib/tracking";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";
import { AuthError, requireAdmin, toErrorResponse } from "@/lib/admin-routes";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return Response.json({ error: "Invalid order id" }, { status: 400 });
    }

    const payload = (await request.json()) as { latitude?: unknown; longitude?: unknown };
    const coords = parseCoordinatePair(payload.latitude, payload.longitude);
    if (!coords) {
      return Response.json(
        { error: "latitude and longitude are required, as valid decimal numbers" },
        { status: 400 },
      );
    }

    const db = await requireAdmin(request).catch(() => null);

    if (!db) {
      const driverDb = getDb();
      await ensureBootstrap(driverDb);
      const driver = await getActiveDriverFromRequest(request, driverDb);
      if (!driver) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
      }
      const [order] = await driverDb.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order || order.driverId !== driver.id) {
        return Response.json({ error: "Not authorized" }, { status: 403 });
      }
      const [updated] = await driverDb
        .update(orders)
        .set({
          driverLat: String(coords.latitude),
          driverLng: String(coords.longitude),
          driverUpdatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();
      if (!updated) return Response.json({ error: "Order not found" }, { status: 404 });
      return Response.json({ ok: true });
    }

    const [order] = await db
      .update(orders)
      .set({
        driverLat: String(coords.latitude),
        driverLng: String(coords.longitude),
        driverUpdatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}
