import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { toErrorResponse } from "../../../../lib/admin-routes";
import { computeOrderQuote, type OrderQuoteInput } from "../../../../lib/checkout";

// Server-side price quote. Runs the identical pipeline as POST /api/checkout
// (server prices, fees, coupon, delivery quote, points cap) so the total the
// customer sees on the website is exactly the total Stripe will charge.
export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as OrderQuoteInput;

    const db = getDb();
    await ensureBootstrap(db);

    const quote = await computeOrderQuote(db, payload);
    if ("error" in quote) {
      return Response.json({ error: quote.error }, { status: 400 });
    }

    return Response.json({
      subtotalCents: quote.totals.subtotalCents,
      serviceFeeCents: quote.totals.serviceFeeCents,
      deliveryFeeCents: quote.totals.deliveryFeeCents,
      taxCents: quote.totals.taxCents,
      couponDiscountCents: quote.totals.couponDiscountCents,
      pointsDiscountCents: quote.totals.pointsDiscountCents,
      totalCents: quote.totals.totalCents,
      maxRedeemablePoints: quote.maxRedeemablePoints,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
