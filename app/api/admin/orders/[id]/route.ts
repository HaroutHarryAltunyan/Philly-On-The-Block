import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { orders } from "@/db/schema";
import { AuthError, requireAdmin, toErrorResponse } from "@/lib/admin-routes";
import { restoreStock } from "@/lib/checkout";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";

const STATUSES = ["new", "preparing", "ready", "delivering", "completed", "cancelled"] as const;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return Response.json({ error: "Invalid order id" }, { status: 400 });
    }

    const payload = (await request.json()) as { status?: string };
    if (!payload.status || !STATUSES.includes(payload.status as (typeof STATUSES)[number])) {
      return Response.json(
        { error: `status must be one of: ${STATUSES.join(", ")}` },
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
        .set({ status: payload.status as (typeof STATUSES)[number] })
        .where(eq(orders.id, orderId))
        .returning();
      if (!updated) return Response.json({ error: "Order not found" }, { status: 404 });
      return Response.json({ order: { ...updated, items: JSON.parse(updated.items) as unknown } });
    }

    const existing = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (existing.length === 0) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    const [order] = await db
      .update(orders)
      .set({ status: payload.status as (typeof STATUSES)[number] })
      .where(and(eq(orders.id, orderId)))
      .returning();

    if (payload.status === "cancelled" && order.paymentStatus === "paid") {
      const lines = JSON.parse(order.items) as Array<{ id?: number; name: string; priceCents: number; optionPriceCents: number; quantity: number; options: string[] }>;
      await restoreStock(
        db,
        lines.map((line) => ({
          ...line,
          id: line.id ?? null,
          name: line.name,
          priceCents: line.priceCents,
          optionPriceCents: line.optionPriceCents,
          options: line.options,
          quantity: line.quantity,
        })),
      );
    }

    return Response.json({ order: { ...order, items: JSON.parse(order.items) as unknown } });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await requireAdmin(request);
    const { id } = await context.params;
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return Response.json({ error: "Invalid order id" }, { status: 400 });
    }

    const existing = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (existing.length === 0) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    const order = existing[0];
    if (order.status !== "cancelled" && order.paymentStatus === "paid") {
      const lines = JSON.parse(order.items) as Array<{ id?: number; name: string; priceCents: number; optionPriceCents: number; quantity: number; options: string[] }>;
      await restoreStock(
        db,
        lines.map((line) => ({
          ...line,
          id: line.id ?? null,
          name: line.name,
          priceCents: line.priceCents,
          optionPriceCents: line.optionPriceCents,
          options: line.options,
          quantity: line.quantity,
        })),
      );
    }

    await db.delete(orders).where(and(eq(orders.id, orderId)));
    return Response.json({ deleted: orderId });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}
