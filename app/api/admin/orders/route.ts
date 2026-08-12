import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { orders } from "../../../../db/schema";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";
import { AuthError, requireAdmin, toErrorResponse } from "../../../../lib/admin-routes";

export async function GET(request: Request) {
  try {
    const db = await requireAdmin(request).catch(() => null);

    if (!db) {
      const driverDb = getDb();
      await ensureBootstrap(driverDb);
      const driver = await getActiveDriverFromRequest(request, driverDb);
      if (!driver) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
      }
      const rows = await driverDb
        .select()
        .from(orders)
        .where(sql`${orders.fulfillment} = 'delivery'`)
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(100);

      return Response.json({
        orders: rows.map((order) => ({
          ...order,
          items: JSON.parse(order.items) as unknown,
        })),
      });
    }

    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt), desc(orders.id)).limit(100);

    return Response.json({
      orders: rows.map((order) => ({
        ...order,
        items: JSON.parse(order.items) as unknown,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}
