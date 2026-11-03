import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureBootstrap } from "../../../db/bootstrap";
import { menuItems } from "../../../db/schema";
import { toErrorResponse } from "../../../lib/admin-routes";
import { attachMenuOptions } from "../../../lib/menu-items";
import { toStoreMenuItem } from "../../../lib/storefront";

export async function GET() {
  try {
    const db = getDb();
    await ensureBootstrap(db);

    const rows = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.available, true))
      .orderBy(asc(menuItems.sortOrder), asc(menuItems.id));

    const items = await attachMenuOptions(db, rows);

    // badge stays a string ("" when unset) for existing API clients.
    return Response.json({ menu: items.map((item) => ({ ...toStoreMenuItem(item), badge: item.badge })) });
  } catch (error) {
    return toErrorResponse(error);
  }
}