import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureBootstrap } from "../../../db/bootstrap";
import { orders } from "../../../db/schema";
import { createCheckoutSession, isStripeConfigured } from "../../../lib/payments";
import { toErrorResponse } from "../../../lib/admin-routes";
import { buildStripeLineItems, OrderValidationError, parseOrderPayload } from "../../../lib/orders";
import { computeOrderQuote, decrementStock, restoreStock, validateStock } from "../../../lib/checkout";
import { geocodeAddress } from "../../../lib/tracking";
import { computePointsEarned } from "../../../lib/points";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Parameters<typeof parseOrderPayload>[0] & {
      paymentMethod?: string;
    };

    const db = getDb();
    await ensureBootstrap(db);

    const quote = await computeOrderQuote(db, payload);
    if ("error" in quote) {
      return Response.json({ error: quote.error }, { status: 400 });
    }

    const isDelivery = payload.fulfillment === "delivery";
    // Cash orders are placed unpaid and stay that way until staff (or the
    // driver) confirms the money was collected in person.
    const payCash = payload.paymentMethod === "cash";

    const parsed = parseOrderPayload(
      {
        ...payload,
        items: quote.lines,
        deliveryFeeCents: quote.deliveryFeeOverrideCents,
      },
      {
        fees: quote.fees,
        coupon: quote.coupon,
        pointsDiscountCents: quote.pointsDiscountCents,
        pointsRedeemedPoints: quote.pointsRedeemedPoints,
      },
    );

    // The customer page can't be relied on to geocode (browser rate limits,
    // ad blockers, etc.). Resolve coordinates server-side so the admin map
    // and tracking page always have the destination. Best-effort: if this
    // fails the order still goes through and the client-side fallback
    // geocodes later.
    if (isDelivery && parsed.address && (!parsed.destLat || !parsed.destLng)) {
      const coords = await geocodeAddress(parsed.address).catch(() => null);
      if (coords) {
        parsed.destLat = String(coords.latitude);
        parsed.destLng = String(coords.longitude);
      }
    }

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
        phoneKey: parsed.phoneKey,
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
        pointsRedeemed: parsed.pointsRedeemed,
        pointsDiscountCents: parsed.pointsDiscountCents,
        totalCents: parsed.totalCents,
        status: "new",
        paymentStatus: "unpaid",
        paymentMethod: payCash ? "cash" : "",
        stripeSessionId: "",
        createdAt: new Date(),
      })
      .returning();

    const orderNumber = `PTB-${String(inserted.id).padStart(3, "0")}`;
    await db.update(orders).set({ orderNumber }).where(eq(orders.id, inserted.id));

    if (payCash) {
      return Response.json({
        mode: "cash",
        order: {
          id: inserted.id,
          orderNumber,
          totalCents: parsed.totalCents,
          fulfillment: parsed.fulfillment,
          status: "new",
        },
      });
    }

    if (!isStripeConfigured()) {
      const decremented = await decrementStock(db, parsed.lines);
      if (!decremented) {
        await restoreStock(db, parsed.lines);
        await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, inserted.id));
        return Response.json(
          {
            error:
              "An item in your bag just sold out. Remove it and try again, or check back shortly.",
          },
          { status: 409 },
        );
      }

      await db
        .update(orders)
        .set({
          paymentStatus: "paid",
          paymentMethod: "demo",
          paidAt: new Date(),
          pointsEarned: computePointsEarned(parsed.subtotalCents),
        })
        .where(eq(orders.id, inserted.id));

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
      lines: buildStripeLineItems(parsed),
      feesLineCents: parsed.serviceFeeCents + parsed.deliveryFeeCents + parsed.taxCents,
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
