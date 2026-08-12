import { sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { coupons } from "../../../../db/schema";
import { computeCouponDiscount, type CouponInfo } from "../../../../lib/orders";
import { toErrorResponse } from "../../../../lib/admin-routes";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { code?: string; subtotalCents?: number };
    const code = (payload.code?.trim() ?? "").toUpperCase();
    const subtotalCents = Math.max(Math.round(Number(payload.subtotalCents) || 0), 0);

    if (!code) {
      return Response.json({ valid: false, error: "Enter a coupon code" }, { status: 200 });
    }

    const db = getDb();
    await ensureBootstrap(db);

    const rows = await db.select().from(coupons).where(sql`${coupons.code} = ${code}`).limit(1);
    const coupon = rows[0];

    if (!coupon || !coupon.active) {
      return Response.json({ valid: false, code, error: "That coupon code isn’t active." }, { status: 200 });
    }

    const info: CouponInfo = {
      type: coupon.type,
      amount: coupon.amount,
      minSubtotalCents: coupon.minSubtotalCents,
    };
    const discountCents = computeCouponDiscount(subtotalCents, info);

    if (discountCents <= 0) {
      const min = coupon.minSubtotalCents;
      return Response.json({
        valid: false,
        code,
        error: min > 0 ? `Coupon requires a subtotal of at least $${(min / 100).toFixed(2)}.` : "Coupon doesn’t apply to this order.",
      });
    }

    return Response.json({
      valid: true,
      code,
      discountCents,
      type: coupon.type,
      amount: coupon.amount,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}