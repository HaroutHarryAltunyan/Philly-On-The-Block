import { inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getSetting } from "./admin-auth";
import { computeDeliveryFeeCents } from "./delivery-fee";
import type { CouponInfo, OrderFees, OrderLine, OrderLineInput, OrderTotals } from "./orders";
import { computeCouponDiscount, computeOrderTotals } from "./orders";
import { getCustomerPoints, maxRedeemable, pointsToCents } from "./points";

export async function loadOrderFees(db: DrizzleD1Database<typeof schema>): Promise<OrderFees> {
  const read = async (key: string, fallback: number): Promise<number> => {
    const raw = await getSetting(db, key);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    serviceFeeCents: Math.round(await read("serviceFeeCents", 150)),
    taxRatePercent: await read("taxRatePercent", 8),
    deliveryFeeCents: Math.round(await read("deliveryFeeCents", 0)),
  };
}

export async function findActiveCoupon(
  db: DrizzleD1Database<typeof schema>,
  code: string,
): Promise<CouponInfo | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const rows = await db
    .select()
    .from(schema.coupons)
    .where(sql`${schema.coupons.code} = ${normalized} AND ${schema.coupons.active} = 1`)
    .limit(1);
  if (rows.length === 0) return null;
  return {
    type: rows[0].type,
    amount: rows[0].amount,
    minSubtotalCents: rows[0].minSubtotalCents,
  };
}

export async function validateStock(
  db: DrizzleD1Database<typeof schema>,
  lines: OrderLine[],
): Promise<{ id: number; name: string; available: number } | null> {
  const requested = new Map<number, number>();
  for (const line of lines) {
    if (line.id === null) continue;
    requested.set(line.id, (requested.get(line.id) ?? 0) + line.quantity);
  }
  if (requested.size === 0) return null;

  const rows = await db
    .select({ id: schema.menuItems.id, name: schema.menuItems.name, stockQty: schema.menuItems.stockQty })
    .from(schema.menuItems)
    .where(inArray(schema.menuItems.id, [...requested.keys()]));

  const found = new Map<number, { name: string; stock: number | null }>();
  for (const row of rows) {
    found.set(row.id, { name: row.name, stock: row.stockQty });
  }

  for (const [id, quantity] of requested) {
    const item = found.get(id);
    const stock = item?.stock ?? null;
    if (item && stock !== null) {
      const available = Math.max(stock, 0);
      if (available < quantity) {
        return { id, name: item.name, available };
      }
    }
  }
  return null;
}

// Returns the lines that were actually decremented. Tracked items only
// decrement while sufficient stock remains (single atomic statement, so
// concurrent checkouts can't both claim the last unit); items without stock
// tracking (stock_qty IS NULL) are unlimited and always succeed. Callers must
// restore exactly this list on failure — never the full input, or lines that
// were not decremented would be inflated.
export async function decrementStock(
  db: DrizzleD1Database<typeof schema>,
  lines: OrderLine[],
): Promise<OrderLine[]> {
  const decremented: OrderLine[] = [];
  for (const line of lines) {
    if (line.id === null) continue;
    const result = await db.run(
      sql`UPDATE menu_items
          SET stock_qty = CASE WHEN stock_qty IS NULL THEN NULL ELSE stock_qty - ${line.quantity} END
          WHERE id = ${line.id} AND (stock_qty IS NULL OR stock_qty >= ${line.quantity})`,
    );
    if ((result.meta?.changes ?? 0) === 1) {
      decremented.push(line);
    }
  }
  return decremented;
}

export async function restoreStock(db: DrizzleD1Database<typeof schema>, lines: OrderLine[]): Promise<void> {
  for (const line of lines) {
    if (line.id === null) continue;
    await db.run(
      sql`UPDATE menu_items SET stock_qty = COALESCE(stock_qty, 0) + ${Math.max(line.quantity, 0)} WHERE id = ${line.id} AND stock_qty IS NOT NULL`,
    );
  }
}

export function allStockDecrementable(decremented: OrderLine[], lines: OrderLine[]): boolean {
  return decremented.length === lines.filter((line) => line.id !== null).length;
}

export async function repriceLines(
  db: DrizzleD1Database<typeof schema>,
  items: OrderLineInput[],
): Promise<{ lines: RepricedLine[] } | { error: string }> {
  const requestedIds = new Set<number>();

  for (const item of items) {
    if (typeof item.id !== "number" || !Number.isInteger(item.id) || item.id <= 0) {
      return { error: "Each item must come from the menu" };
    }
    requestedIds.add(item.id);
  }
  if (requestedIds.size === 0) {
    return { error: "items must not be empty" };
  }

  const ids = [...requestedIds];
  const itemRows = await db
    .select()
    .from(schema.menuItems)
    .where(inArray(schema.menuItems.id, ids));

  const itemsById = new Map(itemRows.map((row) => [row.id, row]));
  for (const id of ids) {
    if (!itemsById.has(id)) {
      return { error: "One of the items is no longer on the menu" };
    }
  }

  const optionRows = await db
    .select()
    .from(schema.menuItemOptions)
    .where(inArray(schema.menuItemOptions.menuItemId, ids));
  const optionsById = new Map<number, Map<string, number>>();
  for (const option of optionRows) {
    const byName = optionsById.get(option.menuItemId) ?? new Map<string, number>();
    byName.set(option.name, option.priceCents);
    optionsById.set(option.menuItemId, byName);
  }

  const lines: RepricedLine[] = [];
  for (const item of items) {
    const id = item.id as number;
    const row = itemsById.get(id)!;
    if (!row.available) {
      return { error: `"${row.name}" is no longer on the menu` };
    }
    const names = Array.isArray(item.options) ? item.options : [];
    const byName = optionsById.get(id) ?? new Map<string, number>();
    let optionPriceCents = 0;
    for (const name of names) {
      const price = byName.get(name);
      if (price === undefined) {
        return { error: `"${name}" is not a valid option for ${row.name}` };
      }
      optionPriceCents += price;
    }
    lines.push({
      id,
      name: row.name,
      priceCents: row.priceCents,
      optionPriceCents,
      quantity: Math.min(Math.max(Math.round(Number(item.quantity) || 1), 1), 99),
      options: names,
    });
  }

  return { lines };
}

export type RepricedLine = OrderLineInput & {
  id: number;
  name: string;
  priceCents: number;
  optionPriceCents: number;
  quantity: number;
  options: string[];
};

export type OrderQuoteInput = {
  items?: OrderLineInput[];
  phone?: string;
  fulfillment?: string;
  address?: string;
  couponCode?: string;
  redeemPoints?: number;
};

export type OrderQuote = {
  lines: RepricedLine[];
  fees: OrderFees;
  coupon: CouponInfo;
  subtotalCents: number;
  couponDiscountCents: number;
  maxRedeemablePoints: number;
  pointsRedeemedPoints: number;
  pointsDiscountCents: number;
  deliveryFeeOverrideCents?: number;
  totals: OrderTotals;
};

// Runs the exact same pricing pipeline as POST /api/checkout (server prices,
// fees, coupon, delivery quote, points cap) without touching stock or
// inserting anything. The checkout route and the /api/checkout/quote endpoint
// both build on this, so a quoted total is always the total that gets charged.
export async function computeOrderQuote(
  db: DrizzleD1Database<typeof schema>,
  input: OrderQuoteInput,
): Promise<OrderQuote | { error: string }> {
  const [fees, coupon] = await Promise.all([
    loadOrderFees(db),
    findActiveCoupon(db, typeof input.couponCode === "string" ? input.couponCode : ""),
  ]);

  const repriced = await repriceLines(db, input.items ?? []);
  if ("error" in repriced) {
    return { error: repriced.error };
  }

  const isDelivery = input.fulfillment === "delivery";
  const deliveryQuote = isDelivery ? await computeDeliveryFeeCents((input.address ?? "").trim()) : null;

  const lines = repriced.lines;
  const subtotalCents = lines.reduce(
    (sum, line) => sum + (line.priceCents + line.optionPriceCents) * line.quantity,
    0,
  );
  const couponDiscountCents = computeCouponDiscount(subtotalCents, coupon);

  const points = await getCustomerPoints(db, typeof input.phone === "string" ? input.phone : "");
  const maxRedeemablePoints = maxRedeemable(points.balance, subtotalCents, couponDiscountCents);
  const requestedPoints = Math.max(Math.round(Number(input.redeemPoints) || 0), 0);
  const pointsRedeemedPoints = Math.min(requestedPoints, maxRedeemablePoints);
  const pointsDiscountCents = pointsToCents(pointsRedeemedPoints);

  const deliveryFeeOverrideCents = isDelivery ? (deliveryQuote?.feeCents ?? fees.deliveryFeeCents) : undefined;

  const totals = computeOrderTotals({
    lines,
    fulfillment: isDelivery ? "delivery" : "pickup",
    fees,
    coupon,
    pointsDiscountCents,
    deliveryFeeOverrideCents,
  });

  return {
    lines,
    fees,
    coupon,
    subtotalCents,
    couponDiscountCents,
    maxRedeemablePoints,
    pointsRedeemedPoints,
    pointsDiscountCents,
    deliveryFeeOverrideCents,
    totals,
  };
}

export async function markOrderPaid(
  db: DrizzleD1Database<typeof schema>,
  orderId: number,
  paymentMethod: string,
): Promise<boolean> {
  const [updated] = await db
    .update(schema.orders)
    .set({
      paymentStatus: "paid",
      paymentMethod,
      paidAt: new Date(),
      pointsEarned: sql`CAST(${schema.orders.subtotalCents} / 100 AS INTEGER)`,
    })
    .where(
      sql`${schema.orders.id} = ${orderId} AND ${schema.orders.paymentStatus} != 'paid' AND ${schema.orders.status} != 'cancelled'`,
    )
    .returning();

  if (!updated) return false;

  const lines = JSON.parse(updated.items) as OrderLine[];
  const decremented = await decrementStock(db, lines);
  if (!allStockDecrementable(decremented, lines)) {
    // The item sold out between validation and payment. Revert exactly the
    // lines that were decremented so the shelf stock stays truthful; the paid
    // order stays visible for staff to refund manually.
    await restoreStock(db, decremented);
  }
  return true;
}