import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";

// Earning rate: 4 points per $1 = $1 in points per $25 spent (each point is
// worth 1 cent, so $25 -> 100 points -> $1 off).
export const POINTS_PER_DOLLAR = 4;
export const POINTS_TO_CENTS = 1;

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function phoneKey(value: string): string {
  return normalizePhone(value ?? "");
}

export function computePointsEarned(subtotalCents: number): number {
  return Math.max(Math.floor(subtotalCents / 100) * POINTS_PER_DOLLAR, 0);
}

export function pointsToCents(points: number): number {
  return Math.max(Math.round(points) * POINTS_TO_CENTS, 0);
}

type Db = DrizzleD1Database<typeof schema>;

async function sumColumn(
  db: Db,
  column: "points_earned" | "points_redeemed",
  where: ReturnType<typeof sql>,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${sql.raw(column)}), 0)`.mapWith(Number).as("total"),
    })
    .from(schema.orders)
    .where(where);
  return row?.total ?? 0;
}

export async function getCustomerPoints(
  db: Db,
  phone: string,
): Promise<{ key: string; balance: number; lifetimeEarned: number; lifetimeRedeemed: number }> {
  const key = phoneKey(phone);
  if (!key) {
    return { key, balance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 };
  }
  const [earned, redeemed] = await Promise.all([
    sumColumn(
      db,
      "points_earned",
      sql`${schema.orders.phoneKey} = ${key} AND ${schema.orders.paymentStatus} = 'paid' AND ${schema.orders.status} != 'cancelled'`,
    ),
    sumColumn(
      db,
      "points_redeemed",
      sql`${schema.orders.phoneKey} = ${key} AND ${schema.orders.paymentStatus} = 'paid' AND ${schema.orders.status} != 'cancelled'`,
    ),
  ]);
  return {
    key,
    balance: Math.max(earned - redeemed, 0),
    lifetimeEarned: earned,
    lifetimeRedeemed: redeemed,
  };
}

export function maxRedeemable(balance: number, subtotalCents: number, couponDiscountCents: number): number {
  const room = Math.max(Math.floor((subtotalCents - couponDiscountCents) / POINTS_TO_CENTS), 0);
  return Math.min(Math.max(balance, 0), room);
}
