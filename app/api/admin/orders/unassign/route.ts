import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { orders } from "@/db/schema";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";
import { AuthError, requireAdmin, toErrorResponse } from "@/lib/admin-routes";

export async function POST(request: Request) {
  try {
    const db = await requireAdmin(request).catch(() => null);

    if (!db) {
      const driverDb = getDb();
      await ensureBootstrap(driverDb);
      const driver = await getActiveDriverFromRequest(request, driverDb);
      if (!driver) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
      }
      const payload = (await request.json()) as { orderId?: number };
      if (!payload.orderId) {
        return Response.json({ error: "orderId required" }, { status: 400 });
      }
      const [order] = await driverDb
        .select()
        .from(orders)
        .where(eq(orders.id, payload.orderId))
        .limit(1);
      if (!order || order.driverId !== driver.id) {
        return Response.json({ error: "Not authorized" }, { status: 403 });
      }
      const [updated] = await driverDb
        .update(orders)
        .set({ driverId: null, status: "ready" })
        .where(eq(orders.id, payload.orderId))
        .returning();
      if (!updated) return Response.json({ error: "Order not found" }, { status: 404 });
      return Response.json({ order: updated });
    }

    const payload = (await request.json()) as { orderId?: number };
    if (!payload.orderId) {
      return Response.json({ error: "orderId required" }, { status: 400 });
    }

    const [updated] = await db
      .update(orders)
      .set({ driverId: null, status: "ready" })
      .where(eq(orders.id, payload.orderId))
      .returning();

    if (!updated) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    return Response.json({ order: updated });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}
