import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { orders } from "../../../../db/schema";
import { getCheckoutSession } from "../../../../lib/payments";
import { toErrorResponse } from "../../../../lib/admin-routes";
import { markOrderPaid } from "../../../../lib/checkout";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) {
      return Response.json({ error: "session_id is required" }, { status: 400 });
    }

    const session = await getCheckoutSession(sessionId);
    if (!session?.metadata?.orderId) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }
    const orderId = Number(session.metadata.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    const db = getDb();
    await ensureBootstrap(db);

    const existing = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (existing.length === 0) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }
    const order = existing[0];

    if (session.payment_status !== "paid") {
      return Response.json(
        { paid: false, error: "Payment not completed" },
        { status: 402 },
      );
    }

    await markOrderPaid(db, orderId, (session.payment_method_types ?? ["card"]).join(", "));

    const [fresh] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    return Response.json({
      paid: true,
      order: {
        id: fresh?.id ?? orderId,
        orderNumber: fresh?.orderNumber ?? order.orderNumber,
        totalCents: fresh?.totalCents ?? order.totalCents,
        fulfillment: fresh?.fulfillment ?? order.fulfillment,
        status: fresh?.status ?? order.status,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
