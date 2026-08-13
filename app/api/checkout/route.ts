import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureBootstrap } from "../../../db/bootstrap";
import { orders } from "../../../db/schema";
import { createCheckoutSession, isStripeConfigured } from "../../../lib/payments";
import { toErrorResponse } from "../../../lib/admin-routes";
import { OrderValidationError, parseOrderPayload, type ParsedOrder } from "../../../lib/orders";
import {
  decrementStock,
  findActiveCoupon,
  loadOrderFees,
  repriceLines,
  validateStock,
} from "../../../lib/checkout";
import { computeDeliveryFeeCents } from "../../../lib/delivery-fee";
import { geocodeAddress } from "../../../lib/tracking";

function buildStripeLineItems(parsed: ParsedOrder) {
  const feesLineCents = parsed.serviceFeeCents + parsed.deliveryFeeCents + parsed.taxCents;
  const subtotalCents = parsed.lines.reduce(
    (sum, line) => sum + (line.priceCents + line.optionPriceCents) * line.quantity,
    0,
  );
  const discountCents = Math.min(parsed.discountCents, subtotalCents);

  const itemLines = parsed.lines.map((line) => ({
    name: line.options.length > 0 ? `${line.name} (${line.options.join(", ")})` : line.name,
    unitCents: line.priceCents + line.optionPriceCents,
    quantity: line.quantity,
    totalCents: (line.priceCents + line.optionPriceCents) * line.quantity,
  }));

  // Apply the discount to the fees line first; any remainder is deducted
  // from the item lines proportionally so the session total always matches
  // the order total and no line amount ever goes negative. The fees line
  // itself is added by createCheckoutSession via totalCents.
  const itemDiscountCents = Math.max(discountCents - feesLineCents, 0);
  if (itemDiscountCents > 0 && subtotalCents > 0) {
    let remaining = itemDiscountCents;
    itemLines.forEach((line, index) => {
      if (remaining <= 0) return;
      const isLast = index === itemLines.length - 1;
      const share = isLast
        ? Math.min(remaining, line.totalCents)
        : Math.min(Math.floor((line.totalCents / subtotalCents) * itemDiscountCents), line.totalCents, remaining);
      line.totalCents -= share;
      remaining -= share;
    });
  }

  return itemLines.map((line) => {
    // When a line absorbed a discount its total may no longer divide evenly
    // by its quantity, so bill it as a single unit to keep the cents exact.
    const discounted = line.totalCents !== line.unitCents * line.quantity;
    return {
      name: line.name,
      quantity: discounted ? 1 : line.quantity,
      amountCents: discounted ? line.totalCents : line.unitCents,
    };
  });
}

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
    const feesLineCents = parsed.serviceFeeCents + parsed.deliveryFeeCents + parsed.taxCents;
    const { url, sessionId } = await createCheckoutSession({
      orderId: inserted.id,
      orderNumber,
      lines: buildStripeLineItems(parsed),
      totalCents: Math.max(feesLineCents - parsed.discountCents, 0),
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
