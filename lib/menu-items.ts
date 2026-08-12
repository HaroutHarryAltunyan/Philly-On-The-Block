import { asc, eq, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export type MenuItemOption = {
  id: number;
  name: string;
  priceCents: number;
};

export type MenuItemWithOptions = typeof schema.menuItems.$inferSelect & {
  stock: number | null;
  options: MenuItemOption[];
};

export async function attachMenuOptions(
  db: DrizzleD1Database<typeof schema>,
  items: Array<typeof schema.menuItems.$inferSelect>,
): Promise<MenuItemWithOptions[]> {
  if (items.length === 0) return [];
  const rows = await db
    .select()
    .from(schema.menuItemOptions)
    .where(inArray(schema.menuItemOptions.menuItemId, items.map((item) => item.id)))
    .orderBy(asc(schema.menuItemOptions.sortOrder), asc(schema.menuItemOptions.id));

  const byItem = new Map<number, MenuItemOption[]>();
  for (const row of rows) {
    const list = byItem.get(row.menuItemId) ?? [];
    list.push({ id: row.id, name: row.name, priceCents: row.priceCents });
    byItem.set(row.menuItemId, list);
  }

  return items.map((item) => ({
    ...item,
    stock: item.stockQty,
    options: byItem.get(item.id) ?? [],
  }));
}

export async function replaceMenuItemOptions(
  db: DrizzleD1Database<typeof schema>,
  menuItemId: number,
  options: Array<{ name?: string; priceCents?: number }>,
): Promise<void> {
  await db.delete(schema.menuItemOptions).where(eq(schema.menuItemOptions.menuItemId, menuItemId));
  const clean = options
    .map((option, index) => ({
      menuItemId,
      name: option.name?.trim() ?? "",
      priceCents: Math.max(Math.round(Number(option.priceCents) || 0), 0),
      sortOrder: index,
    }))
    .filter((option) => option.name.length > 0);

  if (clean.length > 0) {
    await db.insert(schema.menuItemOptions).values(clean);
  }
}

export function parseStockQty(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}