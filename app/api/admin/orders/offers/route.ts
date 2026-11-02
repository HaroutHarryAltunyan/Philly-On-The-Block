import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { toErrorResponse } from "@/lib/admin-routes";
import { audit, driverActor } from "@/lib/audit";
import { acceptOffer, declineOffer, runDispatch } from "@/lib/dispatch";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";

// Driver responds to a dispatch offer: { orderId, action: "accept" | "decline" }.
export async function POST(request: Request) {
  try {
    const db = getDb();
    await ensureBootstrap(db);
    const driver = await getActiveDriverFromRequest(request, db);
    if (!driver) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const payload = (await request.json().catch(() => null)) as { orderId?: number; action?: string } | null;
    const orderId = Number(payload?.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) return Response.json({ error: "orderId required" }, { status: 400 });

    if (payload?.action === "accept") {
      const order = await acceptOffer(db, driver.id, orderId);
      if (!order) return Response.json({ error: "This offer expired or the order was taken." }, { status: 409 });
      await audit(db, request, driverActor(driver), "offer.accept", order.orderNumber);
      return Response.json({ order: { ...order, items: JSON.parse(order.items) as unknown } });
    }
    if (payload?.action === "decline") {
      const declined = await declineOffer(db, driver.id, orderId);
      if (declined) {
        await audit(db, request, driverActor(driver), "offer.decline", orderId);
        await runDispatch(db); // move it to the next driver now
      }
      return Response.json({ declined });
    }
    return Response.json({ error: 'action must be "accept" or "decline"' }, { status: 400 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
