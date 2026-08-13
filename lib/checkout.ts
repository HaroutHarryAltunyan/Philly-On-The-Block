import { inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getSetting } from "./admin-auth";
import type { CouponInfo, OrderFees, OrderLine, OrderLineInput } from "./orders";

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

  const conditions = [...requested.keys()]
    .map((id) => `id = ${id}`)
    .join(" OR ");
  const rows = (await db.run(sql.raw(`SELECT id, name, stock_qty FROM menu_items WHERE ${conditions}`))) as unknown as {
    results?: Array<{ id: number; name: string; stock_qty: number | null }>;
  };
  const found = new Map<number, { name: string; stock: number | null }>();
  for (const row of rows.results ?? []) {
    found.set(row.id, { name: row.name, stock: row.stock_qty });
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

export async function decrementStock(db: DrizzleD1Database<typeof schema>, lines: OrderLine[]): Promise<void> {
  for (const line of lines) {
    if (line.id === null) continue;
    await db
      .update(schema.menuItems)
      .set({
        stockQty: sql`MAX(${schema.menuItems.stockQty} - ${line.quantity}, 0)`,
      })
      .where(sql`${schema.menuItems.id} = ${line.id} AND ${schema.menuItems.stockQty} IS NOT NULL`);
  }
}

export async function restoreStock(db: DrizzleD1Database<typeof schema>, lines: OrderLine[]): Promise<void> {
  for (const line of lines) {
    if (line.id === null) continue;
    await db.run(
      sql.raw(
        `UPDATE menu_items SET stock_qty = COALESCE(stock_qty, 0) + ${Math.max(line.quantity, 0)} WHERE id = ${line.id} AND stock_qty IS NOT NULL`,
      ),
    );
  }
}

export async function repriceLines(
  db: DrizzleD1Database<typeof schema>,
  items: OrderLineInput[],
): Promise<{ lines: Array<OrderLineInput & { name: string; priceCents: number; optionPriceCents: number }> } | { error: string }> {
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

  const lines: Array<OrderLineInput & { name: string; priceCents: number; optionPriceCents: number }> = [];
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
  await decrementStock(db, lines);
  return true;
}