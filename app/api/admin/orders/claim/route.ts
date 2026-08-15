import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { orders, drivers } from "@/db/schema";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";
import { AuthError, requireAdmin, toErrorResponse } from "@/lib/admin-routes";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { orderId?: number; driverId?: number };
    if (!payload.orderId) {
      return Response.json({ error: "orderId required" }, { status: 400 });
    }

    const adminDb = await requireAdmin(request).catch(() => null);

    if (adminDb) {
      const driverId = Number(payload.driverId);
      if (!Number.isInteger(driverId) || driverId <= 0) {
        return Response.json({ error: "driverId required" }, { status: 400 });
      }
      const [driverExists] = await adminDb.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
      if (!driverExists) {
        return Response.json({ error: "Driver not found" }, { status: 404 });
      }
      const [updated] = await adminDb
        .update(orders)
        .set({ driverId })
        .where(and(eq(orders.id, payload.orderId), eq(orders.status, "new")))
        .returning();
      if (!updated) {
        return Response.json({ error: "Order not available for claiming" }, { status: 409 });
      }
      return Response.json({ order: updated });
    }

    const db = getDb();
    await ensureBootstrap(db);
    const driver = await getActiveDriverFromRequest(request, db);
    if (!driver) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const [updated] = await db
      .update(orders)
      .set({ driverId: driver.id })
      .where(and(eq(orders.id, payload.orderId), eq(orders.status, "new")))
      .returning();

    if (!updated) {
      return Response.json({ error: "Order not available for claiming" }, { status: 409 });
    }

    return Response.json({ order: updated });
  } catch (error) {
     if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}
