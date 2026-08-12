import { asc } from "drizzle-orm";
import { menuItems } from "../../../../db/schema";
import { AuthError, requireAdmin, toErrorResponse } from "../../../../lib/admin-routes";
import {
  attachMenuOptions,
  parseStockQty,
  replaceMenuItemOptions,
} from "../../../../lib/menu-items";

export async function GET(request: Request) {
  try {
    const db = await requireAdmin(request);
    const rows = await db
      .select()
      .from(menuItems)
      .orderBy(asc(menuItems.sortOrder), asc(menuItems.id));

    const menu = await attachMenuOptions(db, rows);

    return Response.json({
      menu: menu.map((item) => ({
        ...item,
        stock: item.stock,
        options: item.options,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = await requireAdmin(request);
    const payload = (await request.json()) as {
      name?: string;
      category?: string;
      description?: string;
      priceCents?: number;
      badge?: string;
      image?: string;
      imagePosition?: string;
      available?: boolean;
      stockQty?: number | null;
      sortOrder?: number;
      options?: Array<{ name?: string; priceCents?: number }>;
    };

    const name = payload.name?.trim() ?? "";
    const category = payload.category?.trim() ?? "";
    const priceCents = payload.priceCents;
    const stockQty = parseStockQty(payload.stockQty);

    if (stockQty === null) {
      return Response.json({ error: "stockQty must be a non-negative number" }, { status: 400 });
    }
    if (!name || !category || typeof priceCents !== "number" || priceCents < 0) {
      return Response.json({ error: "name, category, and a non-negative priceCents are required" }, { status: 400 });
    }

    const [item] = await db
      .insert(menuItems)
      .values({
        name,
        category,
        description: payload.description?.trim() ?? "",
        priceCents: Math.round(priceCents),
        badge: payload.badge?.trim() ?? "",
        image: payload.image?.trim() ?? "",
        imagePosition: payload.imagePosition?.trim() ?? "",
        available: payload.available ?? true,
        stockQty,
        sortOrder: payload.sortOrder ?? 0,
        createdAt: new Date(),
      })
      .returning();

    if (payload.options !== undefined) {
      await replaceMenuItemOptions(db, item.id, payload.options);
    }
    const [withOptions] = await attachMenuOptions(db, [item]);

    return Response.json({ item: withOptions }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}