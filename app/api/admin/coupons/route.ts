import { asc, sql } from "drizzle-orm";
import { coupons, couponTypes } from "../../../../db/schema";
import { AuthError, requireAdmin, toErrorResponse } from "../../../../lib/admin-routes";

export async function GET(request: Request) {
  try {
    const db = await requireAdmin(request);
    const rows = await db.select().from(coupons).orderBy(asc(coupons.id));

    return Response.json({ coupons: rows });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = await requireAdmin(request);
    const payload = (await request.json()) as {
      code?: string;
      type?: string;
      amount?: number;
      minSubtotalCents?: number;
      active?: boolean;
    };

    const code = (payload.code?.trim() ?? "").toUpperCase();
    const amount = payload.amount;
    if (!code) {
      return Response.json({ error: "code is required" }, { status: 400 });
    }
    if (!payload.type || !couponTypes.includes(payload.type as (typeof couponTypes)[number])) {
      return Response.json(
        { error: `type must be one of: ${couponTypes.join(", ")}` },
        { status: 400 },
      );
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    if (payload.type === "percent" && amount > 100) {
      return Response.json({ error: "percent amount must be between 1 and 100" }, { status: 400 });
    }
    const minSubtotalCents = Math.round(Number(payload.minSubtotalCents) || 0);
    if (!Number.isFinite(minSubtotalCents) || minSubtotalCents < 0) {
      return Response.json({ error: "minSubtotalCents must be a non-negative number" }, { status: 400 });
    }

    const existing = await db.select().from(coupons).where(sql`${coupons.code} = ${code}`).limit(1);
    if (existing.length > 0) {
      return Response.json({ error: "A coupon with that code already exists" }, { status: 409 });
    }

    const [coupon] = await db
      .insert(coupons)
      .values({
        code,
        type: payload.type as (typeof couponTypes)[number],
        amount: Math.round(amount),
        minSubtotalCents,
        active: payload.active ?? true,
        createdAt: new Date(),
      })
      .returning();

    return Response.json({ coupon }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}