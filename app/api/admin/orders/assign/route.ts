import { and, eq, inArray } from "drizzle-orm";
import { drivers, orders } from "@/db/schema";
import { requireStaff, toErrorResponse } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { afterStaffAssigned } from "@/lib/dispatch";

// Web dashboard "Assign driver". Assigns without changing the kitchen status;
// the driver marks "out for delivery" when they actually pick it up.
export async function POST(request: Request) {
  try {
    const { db, actor } = await requireStaff(request);
    const payload = (await request.json()) as { orderId?: number; driverId?: number };
    const orderId = Number(payload.orderId);
    const driverId = Number(payload.driverId);
    if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isInteger(driverId) || driverId <= 0) {
      return Response.json({ error: "orderId and driverId required" }, { status: 400 });
    }
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    if (!driver || driver.status !== "active") {
      return Response.json({ error: "Driver not found or inactive" }, { status: 404 });
    }

    const [updated] = await db
      .update(orders)
      .set({ driverId })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.fulfillment, "delivery"),
          inArray(orders.status, ["new", "preparing", "ready", "delivering"]),
        ),
      )
      .returning();
    if (!updated) {
      return Response.json({ error: "Order can't be assigned (not found, not delivery, or already finished)" }, { status: 409 });
    }
    await audit(db, request, actor, "order.assign", updated.orderNumber, { driverId, driver: driver.name });
    await afterStaffAssigned(db, updated);
    return Response.json({ order: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}
