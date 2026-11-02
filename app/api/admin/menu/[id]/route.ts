import { audit } from "@/lib/audit";
import { and, eq } from "drizzle-orm";
import { menuItemOptions, menuItems } from "../../../../../db/schema";
import { AuthError, toErrorResponse, requireStaff, MANAGERS, ForbiddenError } from "../../../../../lib/admin-routes";
import {
  attachMenuOptions,
  parseStockQty,
  replaceMenuItemOptions,
} from "../../../../../lib/menu-items";

function idFromParams(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return params;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, actor } = await requireStaff(request);
    const { id } = await idFromParams(request, context);
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return Response.json({ error: "Invalid item id" }, { status: 400 });
    }

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

    // Kitchen accounts can switch items on/off and set stock, nothing else.
    if (actor.role === "kitchen") {
      const extra = Object.keys(payload).filter((key) => key !== "available" && key !== "stockQty");
      if (extra.length) {
        return Response.json({ error: "Kitchen accounts can only change availability and stock" }, { status: 403 });
      }
    }

    if (payload.priceCents !== undefined && (typeof payload.priceCents !== "number" || payload.priceCents < 0)) {
      return Response.json({ error: "priceCents must be a non-negative number" }, { status: 400 });
    }

    const existing = await db.select().from(menuItems).where(eq(menuItems.id, itemId)).limit(1);
    if (existing.length === 0) {
      return Response.json({ error: "Menu item not found" }, { status: 404 });
    }

    const current = existing[0];
    let stockQty: number | null;
    if (payload.stockQty === undefined) {
      stockQty = current.stockQty ?? null;
    } else if (payload.stockQty === null) {
      stockQty = null;
    } else {
      const parsed = parseStockQty(payload.stockQty);
      if (parsed === null || parsed === undefined) {
        return Response.json({ error: "stockQty must be a non-negative number" }, { status: 400 });
      }
      stockQty = parsed;
    }
    const [item] = await db
      .update(menuItems)
      .set({
        name: payload.name?.trim() || current.name,
        category: payload.category?.trim() || current.category,
        description: payload.description !== undefined ? payload.description.trim() : current.description,
        priceCents: payload.priceCents !== undefined ? Math.round(payload.priceCents) : current.priceCents,
        badge: payload.badge !== undefined ? payload.badge.trim() : current.badge,
        image: payload.image !== undefined ? payload.image.trim() : current.image,
        imagePosition:
          payload.imagePosition !== undefined ? payload.imagePosition.trim() : current.imagePosition,
        available: payload.available ?? current.available,
        stockQty,
        sortOrder: payload.sortOrder ?? current.sortOrder,
      })
      .where(and(eq(menuItems.id, itemId)))
      .returning();

    if (payload.options !== undefined) {
      await replaceMenuItemOptions(db, itemId, payload.options);
    }
    const [withOptions] = await attachMenuOptions(db, [item]);

    await audit(db, request, actor, "menu.update", itemId, payload);

    return Response.json({ item: withOptions });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, actor } = await requireStaff(request, MANAGERS);
    const { id } = await idFromParams(request, context);
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return Response.json({ error: "Invalid item id" }, { status: 400 });
    }

    const existing = await db.select().from(menuItems).where(eq(menuItems.id, itemId)).limit(1);
    if (existing.length === 0) {
      return Response.json({ error: "Menu item not found" }, { status: 404 });
    }

    // The runtime bootstrap DDL creates menu_item_options without a foreign
    // key, so delete options explicitly to avoid orphans.
    await db.delete(menuItemOptions).where(eq(menuItemOptions.menuItemId, itemId));
    await db.delete(menuItems).where(and(eq(menuItems.id, itemId)));
    await audit(db, request, actor, "menu.delete", itemId);
    return Response.json({ deleted: itemId });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    return toErrorResponse(error);
  }
}