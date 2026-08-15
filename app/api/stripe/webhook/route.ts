import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { orders } from "../../../../db/schema";
import { verifyWebhookSignature } from "../../../../lib/payments";
import { markOrderPaid } from "../../../../lib/checkout";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const body = await request.text();

  let event;
  try {
    event = await verifyWebhookSignature(body, signature);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!event) {
    return Response.json({ error: "Stripe webhooks are not configured" }, { status: 503 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = Number(session.metadata?.orderId);
    if (Number.isInteger(orderId) && orderId > 0) {
      const db = getDb();
      await ensureBootstrap(db);

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) {
        console.warn(`Stripe webhook: order ${orderId} not found`);
        return Response.json({ received: true });
      }

      // Defense in depth: the session total was built from server-computed
      // prices, so a mismatch means the session and order have drifted.
      // Don't mark the order paid; acknowledge the event so Stripe stops
      // retrying and staff can reconcile manually.
      if (typeof session.amount_total === "number" && session.amount_total !== order.totalCents) {
        console.warn(
          `Stripe webhook: amount mismatch for order ${order.orderNumber} (session ${session.amount_total} vs order ${order.totalCents})`,
        );
        return Response.json({ received: true, ignored: "amount_mismatch" });
      }

      await markOrderPaid(db, orderId, (session.payment_method_types ?? ["card"]).join(", "));
    }
  }

  return Response.json({ received: true });
}
