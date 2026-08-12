import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureBootstrap } from "../../../db/bootstrap";
import { menuItems } from "../../../db/schema";
import { toErrorResponse } from "../../../lib/admin-routes";
import { attachMenuOptions } from "../../../lib/menu-items";

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

    return Response.json({
      menu: items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        description: item.description,
        price: item.priceCents / 100,
        badge: item.badge,
        image: item.image,
        imagePosition: item.imagePosition || undefined,
        photo: item.image.includes("/images/menu/") || item.image.includes("/api/menu-image/"),
        stock: item.stock === null ? null : item.stock <= 0 ? 0 : 1,
        options: item.options,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}