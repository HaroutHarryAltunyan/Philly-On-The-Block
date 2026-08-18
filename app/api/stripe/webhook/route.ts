import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { orders } from "../../../../db/schema";
import { verifyWebhookSignature } from "../../../../lib/payments";
import { markOrderPaid, releaseStock } from "../../../../lib/checkout";

export async function GET() {
  return Response.json({ ok: true, message: "Stripe webhook endpoint is active. This endpoint accepts POST only." });
}

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
      // prices, so a mismatch means the session and order have drifted. The
      // customer did pay Stripe, so mark the order paid anyway (matching the
      // success path) but log loudly so staff can reconcile the difference.
      if (typeof session.amount_total === "number" && session.amount_total !== order.totalCents) {
        console.warn(
          `Stripe webhook: AMOUNT MISMATCH for order ${order.orderNumber} (session ${session.amount_total} vs order ${order.totalCents}) — marking paid, reconcile the difference`,
        );
      }

      await markOrderPaid(db, orderId, (session.payment_method_types ?? ["card"]).join(", "));
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    const orderId = Number(session.metadata?.orderId);
    if (Number.isInteger(orderId) && orderId > 0) {
      const db = getDb();
      await ensureBootstrap(db);

      // The session expired without payment: cancel the order and release the
      // stock reserved at creation so it's sellable again. The cancel is a
      // single guarded update (still unpaid, not already cancelled) so a
      // completed event that races in between can't leave a paid order
      // cancelled; stock is released only if this update actually won.
      // releaseStock separately claims its record atomically.
      const [updated] = await db
        .update(orders)
        .set({ status: "cancelled" })
        .where(
          sql`${orders.id} = ${orderId} AND ${orders.paymentStatus} = 'unpaid' AND ${orders.status} != 'cancelled'`,
        )
        .returning();
      if (updated) {
        await releaseStock(db, orderId);
      }
    }
  }

  return Response.json({ received: true });
}
