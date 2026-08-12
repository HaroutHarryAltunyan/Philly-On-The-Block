import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
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
      await markOrderPaid(db, orderId, (session.payment_method_types ?? ["card"]).join(", "));
    }
  }

  return Response.json({ received: true });
}
