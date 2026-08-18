import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type Stripe from "stripe";
import * as schema from "../db/schema";
import { getSetting } from "./admin-auth";
import { computeDeliveryFeeCents } from "./delivery-fee";
import type { CouponInfo, OrderFees, OrderLine, OrderLineInput, OrderTotals } from "./orders";
import { computeCouponDiscount, computeOrderTotals } from "./orders";
import { getCheckoutSession, isStripeConfigured } from "./payments";
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

// Tracked items only decrement while sufficient stock remains (single atomic
// statement, so concurrent checkouts can't both claim the last unit); items
// without stock tracking (stock_qty IS NULL) are unlimited and always satisfy.
// `satisfied` is the all-or-nothing check list; `taken` is what was actually
// decremented (unlimited items satisfy without being taken, so restoring them
// later would inflate stock if tracking is enabled in the meantime).
export async function decrementStock(
  db: DrizzleD1Database<typeof schema>,
  lines: OrderLine[],
): Promise<{ satisfied: OrderLine[]; taken: OrderLine[] }> {
  const satisfied: OrderLine[] = [];
  const taken: OrderLine[] = [];
  for (const line of lines) {
    if (line.id === null) continue;
    const result = (await db.run(
      sql`UPDATE menu_items
          SET stock_qty = CASE WHEN stock_qty IS NULL THEN NULL ELSE stock_qty - ${line.quantity} END
          WHERE id = ${line.id} AND (stock_qty IS NULL OR stock_qty >= ${line.quantity})
          RETURNING id, stock_qty`,
    )) as unknown as { results?: Array<{ id: number; stock_qty: number | null }> };
    const row = result.results?.[0];
    if (!row) continue; // sold out — not satisfied
    satisfied.push(line);
    if (row.stock_qty !== null) taken.push(line); // NULL = unlimited, nothing was taken
  }
  return { satisfied, taken };
}

export async function restoreStock(db: DrizzleD1Database<typeof schema>, lines: OrderLine[]): Promise<void> {
  for (const line of lines) {
    if (line.id === null) continue;
    await db.run(
      sql`UPDATE menu_items SET stock_qty = COALESCE(stock_qty, 0) + ${Math.max(line.quantity, 0)} WHERE id = ${line.id} AND stock_qty IS NOT NULL`,
    );
  }
}

export function allStockDecrementable(satisfied: OrderLine[], lines: OrderLine[]): boolean {
  return satisfied.length === lines.filter((line) => line.id !== null).length;
}

// Decrements stock for the order's lines and records exactly which lines were
// actually taken on the order row. Recording matters: a line can fail to
// decrement (sold out in the meantime), and cancel/expire must restore only
// what was actually taken — never the full item list.
export async function reserveStock(
  db: DrizzleD1Database<typeof schema>,
  orderId: number,
  lines: OrderLine[],
): Promise<OrderLine[]> {
  const { satisfied, taken } = await decrementStock(db, lines);
  await db
    .update(schema.orders)
    .set({ stockDecremented: JSON.stringify(taken) })
    .where(eq(schema.orders.id, orderId));
  return satisfied;
}

// Restores exactly the lines recorded by reserveStock. The record is claimed
// atomically (single UPDATE ... WHERE != '' RETURNING), so a cancel and an
// expiry webhook racing each other can only restore once.
export async function releaseStock(db: DrizzleD1Database<typeof schema>, orderId: number): Promise<void> {
  const [claimed] = await db
    .update(schema.orders)
    .set({ stockDecremented: "" })
    .where(sql`${schema.orders.id} = ${orderId} AND ${schema.orders.stockDecremented} != ''`)
    .returning({ stockDecremented: schema.orders.stockDecremented });
  if (!claimed) return;

  let lines: OrderLine[] = [];
  try {
    const parsed = JSON.parse(claimed.stockDecremented);
    if (Array.isArray(parsed)) lines = parsed;
  } catch {
    return;
  }
  if (lines.length === 0) return;
  await restoreStock(db, lines);
}

// Restores the stock an order still holds. Orders created before the
// stock_decremented column existed have no record; for those, fall back to
// the legacy behavior (restore the full item list, paid orders only — their
// stock was decremented at payment time by the old code).
export async function restoreOrderStock(
  db: DrizzleD1Database<typeof schema>,
  order: { id: number; items: string; paymentStatus: string; stockDecremented?: string },
): Promise<void> {
  if (order.stockDecremented) {
    await releaseStock(db, order.id);
    return;
  }
  if (order.paymentStatus !== "paid") return;

  let lines: OrderLine[] = [];
  try {
    const parsed = JSON.parse(order.items);
    if (Array.isArray(parsed)) lines = parsed;
  } catch {
    return;
  }
  await restoreStock(db, lines);
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
  options: { reserveStock?: boolean } = {},
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

  // Card orders reserve stock when the Stripe session is created, so they
  // arrive here already recorded. Cash payments reserve now. A stripe order
  // with a session but no record was created before reservation existed —
  // reserve now to keep the old behavior for in-flight orders. Whatever
  // actually decrements is recorded on the order; a line that sold out in the
  // meantime simply stays at zero and the paid order remains for staff to
  // refund manually (cancel/expire restores exactly the recorded lines).
  const needsReservation = options.reserveStock || (!updated.stockDecremented && updated.stripeSessionId !== "");
  if (needsReservation) {
    const lines = JSON.parse(updated.items) as OrderLine[];
    await reserveStock(db, orderId, lines);
  }
  return true;
}

// Safety net for the two webhooks that finalize a card order:
// `checkout.session.completed` (marks paid) and `checkout.session.expired`
// (cancels + releases stock). If either is lost, a card order can linger
// unpaid with its stock still reserved — or be paid on Stripe yet unpaid in
// our DB. This sweep reconciles old unpaid card orders against Stripe's ground
// truth: "complete" -> mark paid, "expired" -> cancel + release, "open" ->
// still payable, leave alone. Stripe's default Checkout session lifetime is 24h,
// so anything older than the cutoff that is still unpaid is past that window
// and safe to reconcile.
export async function reapLingeringStripeOrders(
  db: DrizzleD1Database<typeof schema>,
  options: { maxAgeHours?: number; batchSize?: number } = {},
): Promise<{ checked: number; markedPaid: number; cancelled: number }> {
  if (!isStripeConfigured()) {
    return { checked: 0, markedPaid: 0, cancelled: 0 };
  }
  const maxAgeHours = options.maxAgeHours ?? 26;
  const batchSize = options.batchSize ?? 100;
  const cutoff = Date.now() - maxAgeHours * 3_600_000;

  const rows = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.paymentStatus, "unpaid"),
        sql`${schema.orders.status} != 'cancelled'`,
        sql`${schema.orders.stripeSessionId} != ''`,
        sql`${schema.orders.createdAt} <= ${cutoff}`,
      ),
    )
    .limit(batchSize);

  let checked = 0;
  let markedPaid = 0;
  let cancelled = 0;

  for (const order of rows) {
    let session: Stripe.Checkout.Session;
    try {
      session = await getCheckoutSession(order.stripeSessionId);
    } catch {
      continue; // transient Stripe error — try again on the next sweep
    }
    checked++;

    if (session.status === "complete") {
      // Paid on Stripe but the completed webhook never landed. Card orders
      // reserved stock at creation, so markOrderPaid's reservation guard is a
      // no-op here. Mirror the webhook/success defense-in-depth: log loudly on
      // a drift between the charged total and the stored order total.
      if (typeof session.amount_total === "number" && session.amount_total !== order.totalCents) {
        console.warn(
          `Reaper: AMOUNT MISMATCH for order ${order.orderNumber} (session ${session.amount_total} vs order ${order.totalCents}) — marking paid, reconcile the difference`,
        );
      }
      const paid = await markOrderPaid(
        db,
        order.id,
        (session.payment_method_types ?? ["card"]).join(", "),
      );
      if (paid) markedPaid++;
    } else if (session.status === "expired") {
      // Expired on Stripe but the expired webhook never landed. Cancel and
      // release the reserved stock using the same guarded, atomic steps the
      // webhook uses so a racing completed event can't cancel a paid order.
      const [updated] = await db
        .update(schema.orders)
        .set({ status: "cancelled" })
        .where(
          sql`${schema.orders.id} = ${order.id} AND ${schema.orders.paymentStatus} = 'unpaid' AND ${schema.orders.status} != 'cancelled'`,
        )
        .returning();
      if (updated) {
        await releaseStock(db, order.id);
        cancelled++;
      }
    }
    // status === "open" is still payable — leave it alone.
  }

  return { checked, markedPaid, cancelled };
}