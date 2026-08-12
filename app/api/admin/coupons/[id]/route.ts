import { and, eq, sql } from "drizzle-orm";
import { coupons, couponTypes } from "../../../../../db/schema";
import { AuthError, requireAdmin, toErrorResponse } from "../../../../../lib/admin-routes";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await requireAdmin(request);
    const { id } = await context.params;
    const couponId = Number(id);
    if (!Number.isInteger(couponId) || couponId <= 0) {
      return Response.json({ error: "Invalid coupon id" }, { status: 400 });
    }

    const payload = (await request.json()) as {
      code?: string;
      type?: string;
      amount?: number;
      minSubtotalCents?: number;
      active?: boolean;
    };

    if (payload.type !== undefined && !couponTypes.includes(payload.type as (typeof couponTypes)[number])) {
      return Response.json(
        { error: `type must be one of: ${couponTypes.join(", ")}` },
        { status: 400 },
      );
    }
    if (payload.amount !== undefined && (typeof payload.amount !== "number" || payload.amount <= 0)) {
      return Response.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    if (payload.type === "percent" && payload.amount !== undefined && payload.amount > 100) {
      return Response.json({ error: "percent amount must be between 1 and 100" }, { status: 400 });
    }
    if (
      payload.minSubtotalCents !== undefined &&
      (typeof payload.minSubtotalCents !== "number" || payload.minSubtotalCents < 0)
    ) {
      return Response.json({ error: "minSubtotalCents must be a non-negative number" }, { status: 400 });
    }

    const existing = await db.select().from(coupons).where(eq(coupons.id, couponId)).limit(1);
    if (existing.length === 0) {
      return Response.json({ error: "Coupon not found" }, { status: 404 });
    }

    const current = existing[0];
    const code = payload.code !== undefined ? payload.code.trim().toUpperCase() : current.code;
    if (!code) {
      return Response.json({ error: "code must not be empty" }, { status: 400 });
    }
    const clash = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.code, code), sql`${coupons.id} != ${couponId}`))
      .limit(1);
    if (clash.length > 0) {
      return Response.json({ error: "A coupon with that code already exists" }, { status: 409 });
    }

    const [coupon] = await db
      .update(coupons)
      .set({
        code,
        type: (payload.type ?? current.type) as "fixed" | "percent",
        amount: payload.amount !== undefined ? Math.round(payload.amount) : current.amount,
        minSubtotalCents:
          payload.minSubtotalCents !== undefined ? Math.round(payload.minSubtotalCents) : current.minSubtotalCents,
        active: payload.active ?? current.active,
      })
      .where(eq(coupons.id, couponId))
      .returning();

    return Response.json({ coupon });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await requireAdmin(request);
    const { id } = await context.params;
    const couponId = Number(id);
    if (!Number.isInteger(couponId) || couponId <= 0) {
      return Response.json({ error: "Invalid coupon id" }, { status: 400 });
    }

    const existing = await db.select().from(coupons).where(eq(coupons.id, couponId)).limit(1);
    if (existing.length === 0) {
      return Response.json({ error: "Coupon not found" }, { status: 404 });
    }

    await db.delete(coupons).where(eq(coupons.id, couponId));
    return Response.json({ deleted: couponId });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}