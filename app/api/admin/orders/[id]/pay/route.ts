import { audit, driverActor, type AuditActor } from "@/lib/audit";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap, type Db } from "@/db/bootstrap";
import { orders } from "@/db/schema";
import { AuthError, toErrorResponse, ForbiddenError, requireStaff } from "@/lib/admin-routes";
import { markOrderPaid } from "@/lib/checkout";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return Response.json({ error: "Invalid order id" }, { status: 400 });
    }

    const payload = (await request.json().catch(() => null)) as { method?: string } | null;
    // Payment is collected in person: cash, or a card run on the in-store /
    // driver terminal. Online card payments go through Stripe instead.
    const method = payload?.method === "cash" ? "cash" : payload?.method === "card" ? "card_in_person" : null;
    if (!method) {
      return Response.json({ error: 'method must be "cash" or "card"' }, { status: 400 });
    }

    const staff = await requireStaff(request).catch(() => null);
    const adminDb = staff?.db ?? null;
    let actorInfo: AuditActor | null = staff?.actor ?? null;

    let db: Db;
    let order: (typeof orders.$inferSelect) | undefined;

    if (adminDb) {
      db = adminDb;
      const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      order = rows[0];
    } else {
      const driverDb = getDb();
      await ensureBootstrap(driverDb);
      const driver = await getActiveDriverFromRequest(request, driverDb);
      if (!driver) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
      }
      const rows = await driverDb.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      order = rows[0];
      if (!order || order.driverId !== driver.id) {
        return Response.json({ error: "Not authorized" }, { status: 403 });
      }
      db = driverDb;
      actorInfo = driverActor(driver);
    }

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.paymentStatus === "paid") {
      return Response.json({ error: "Order is already paid" }, { status: 409 });
    }
    if (order.status === "cancelled") {
      return Response.json({ error: "Order is cancelled" }, { status: 409 });
    }

    // In-person orders reserved no stock at creation — reserve now that the money
    // is confirmed. Whatever actually decrements gets recorded on the order so
    // a later cancel restores exactly that.
    const paid = await markOrderPaid(db, orderId, method, { reserveStock: true });
    if (!paid) {
      return Response.json({ error: "Could not mark order as paid" }, { status: 409 });
    }

    const [updated] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    await audit(db, request, actorInfo!, "order.paid", order.orderNumber, { method, totalCents: order.totalCents });
    return Response.json({ order: { ...updated, items: JSON.parse(updated.items) as unknown } });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    return toErrorResponse(error);
  }
}
