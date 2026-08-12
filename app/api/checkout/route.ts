import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureBootstrap } from "../../../db/bootstrap";
import { orders } from "../../../db/schema";
import { createCheckoutSession, isStripeConfigured } from "../../../lib/payments";
import { toErrorResponse } from "../../../lib/admin-routes";
import { OrderValidationError, parseOrderPayload } from "../../../lib/orders";
import {
  decrementStock,
  findActiveCoupon,
  loadOrderFees,
  repriceLines,
  validateStock,
} from "../../../lib/checkout";
import { computeDeliveryFeeCents } from "../../../lib/delivery-fee";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Parameters<typeof parseOrderPayload>[0];

    const db = getDb();
    await ensureBootstrap(db);

    const [fees, coupon] = await Promise.all([
      loadOrderFees(db),
      findActiveCoupon(db, typeof payload.couponCode === "string" ? payload.couponCode : ""),
    ]);

    const repriced = await repriceLines(db, payload.items ?? []);
    if ("error" in repriced) {
      return Response.json({ error: repriced.error }, { status: 400 });
    }

    const isDelivery = payload.fulfillment === "delivery";
    const deliveryQuote = isDelivery ? await computeDeliveryFeeCents(payload.address?.trim() ?? "") : null;

    const parsed = parseOrderPayload(
      {
        ...payload,
        items: repriced.lines,
        deliveryFeeCents: isDelivery ? (deliveryQuote?.feeCents ?? fees.deliveryFeeCents) : undefined,
      },
      { fees, coupon },
    );

    const soldOut = await validateStock(db, parsed.lines);
    if (soldOut) {
      return Response.json(
        {
          error:
            soldOut.available === 0
              ? `"${soldOut.name}" just sold out. Remove it from your bag and try again.`
              : `Only ${soldOut.available} of "${soldOut.name}" left. Adjust the quantity and try again.`,
        },
        { status: 409 },
      );
    }

    const [inserted] = await db
      .insert(orders)
      .values({
        orderNumber: "PTB-000",
        name: parsed.name,
        phone: parsed.phone,
        address: parsed.address,
        destLat: parsed.destLat,
        destLng: parsed.destLng,
        fulfillment: parsed.fulfillment,
        items: JSON.stringify(parsed.lines),
        notes: parsed.notes,
        subtotalCents: parsed.subtotalCents,
        serviceFeeCents: parsed.serviceFeeCents,
        deliveryFeeCents: parsed.deliveryFeeCents,
        taxCents: parsed.taxCents,
        discountCents: parsed.discountCents,
        couponCode: parsed.couponCode,
        totalCents: parsed.totalCents,
        status: "new",
        paymentStatus: "unpaid",
        paymentMethod: "",
        stripeSessionId: "",
        createdAt: new Date(),
      })
      .returning();

    const orderNumber = `PTB-${String(inserted.id).padStart(3, "0")}`;
    await db.update(orders).set({ orderNumber }).where(eq(orders.id, inserted.id));

    if (!isStripeConfigured()) {
      await db
        .update(orders)
        .set({ paymentStatus: "paid", paymentMethod: "demo", paidAt: new Date() })
        .where(eq(orders.id, inserted.id));
      await decrementStock(db, parsed.lines);

      return Response.json({
        mode: "demo",
        order: {
          id: inserted.id,
          orderNumber,
          totalCents: parsed.totalCents,
          fulfillment: parsed.fulfillment,
          status: "new",
        },
      });
    }

    const origin = new URL(request.url).origin;
    const { url, sessionId } = await createCheckoutSession({
      orderId: inserted.id,
      orderNumber,
      lines: parsed.lines.map((line) => ({
        name: line.options.length > 0 ? `${line.name} (${line.options.join(", ")})` : line.name,
        quantity: line.quantity,
        amountCents: line.priceCents + line.optionPriceCents,
      })),
      totalCents: parsed.serviceFeeCents + parsed.deliveryFeeCents + parsed.taxCents - parsed.discountCents,
      successUrl: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/?canceled=1`,
    });

    await db
      .update(orders)
      .set({ stripeSessionId: sessionId })
      .where(eq(orders.id, inserted.id));

    return Response.json({
      mode: "stripe",
      url,
      order: { id: inserted.id, orderNumber },
    });
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}
