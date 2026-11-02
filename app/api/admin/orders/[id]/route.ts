import { audit, driverActor } from "@/lib/audit";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { orders } from "@/db/schema";
import { AuthError, toErrorResponse, ForbiddenError, requireStaff, MANAGERS } from "@/lib/admin-routes";
import { restoreOrderStock } from "@/lib/checkout";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";
import { checkRateLimit, clearRateLimit } from "@/lib/rate-limit";
import { afterOrderChange } from "@/lib/dispatch";

const PIN_MAX_ATTEMPTS = 8;
const PIN_WINDOW_MS = 10 * 60 * 1000;

const STATUSES = ["new", "preparing", "ready", "delivering", "completed", "cancelled"] as const;
type OrderStatus = (typeof STATUSES)[number];

// Status a driver may set -> statuses the order must currently be in.
const DRIVER_TRANSITIONS: Partial<Record<string, OrderStatus[]>> = {
  delivering: ["preparing", "ready"],
  completed: ["ready", "delivering"],
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return Response.json({ error: "Invalid order id" }, { status: 400 });
    }

    const payload = (await request.json()) as { status?: string; pin?: string };
    if (!payload.status || !STATUSES.includes(payload.status as (typeof STATUSES)[number])) {
      return Response.json(
        { error: `status must be one of: ${STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const staff = await requireStaff(request).catch(() => null);
    const db = staff?.db ?? null;

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
      // Drivers only move an order forward through the delivery leg; the
      // kitchen statuses, cancellation and reversals stay with staff.
      const allowedFrom = DRIVER_TRANSITIONS[payload.status];
      if (!allowedFrom) {
        return Response.json({ error: "Drivers can only mark orders out for delivery or delivered" }, { status: 403 });
      }
      if (!allowedFrom.includes(order.status)) {
        return Response.json(
          { error: `Order is ${order.status}; it can't be marked ${payload.status} now` },
          { status: 409 },
        );
      }
      // Proof of delivery: the customer reads their 4-digit code to the
      // driver. Attempts are rate limited so the code can't be brute-forced.
      if (payload.status === "completed" && order.deliveryPin) {
        const limited = await checkRateLimit(driverDb, `delivery-pin:${orderId}`, PIN_MAX_ATTEMPTS, PIN_WINDOW_MS);
        if (!limited.allowed) {
          return Response.json({ error: "Too many wrong codes. Call the restaurant." }, { status: 429 });
        }
        const pin = String(payload.pin ?? "").replace(/\D/g, "");
        if (!pin) {
          return Response.json({ error: "Enter the 4-digit delivery code from the customer.", code: "pin_required" }, { status: 422 });
        }
        if (pin !== order.deliveryPin) {
          return Response.json({ error: "That delivery code doesn't match. Ask the customer to check their app.", code: "pin_mismatch" }, { status: 422 });
        }
        await clearRateLimit(driverDb, `delivery-pin:${orderId}`);
      }
      const driverActorInfo = driverActor(driver);
      // Conditional update so a stale client can't overwrite a status that
      // changed underneath it (e.g. staff cancelled the order meanwhile).
      const [updated] = await driverDb
        .update(orders)
        .set({ status: payload.status as (typeof STATUSES)[number] })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.driverId, driver.id),
            inArray(orders.status, allowedFrom),
          ),
        )
        .returning();
      if (!updated) {
        return Response.json(
          { error: `Order is ${order.status}; it can't be marked ${payload.status} now` },
          { status: 409 },
        );
      }
      await audit(driverDb, request, driverActorInfo, "order.status", order.orderNumber, { from: order.status, to: payload.status });
      await afterOrderChange(driverDb, updated, order.status);
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

    if (payload.status === "cancelled") {
      // Restores exactly the lines recorded on the order (or, for legacy
      // orders without a record, the full item list if paid). Unpaid cash
      // orders reserved nothing, so this is a no-op for them.
      await restoreOrderStock(db, order);
    }
    await audit(db, request, staff!.actor, "order.status", order.orderNumber, { from: existing[0].status, to: payload.status });
    await afterOrderChange(db, order, existing[0].status);

    return Response.json({ order: { ...order, items: JSON.parse(order.items) as unknown } });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, actor } = await requireStaff(request, MANAGERS);
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
    if (order.status !== "cancelled") {
      await restoreOrderStock(db, order);
    }

    await db.delete(orders).where(and(eq(orders.id, orderId)));
    await audit(db, request, actor, "order.delete", order.orderNumber, { totalCents: order.totalCents, status: order.status });
    return Response.json({ deleted: orderId });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    return toErrorResponse(error);
  }
}
