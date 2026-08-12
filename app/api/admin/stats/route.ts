import { and, asc, desc, gte, inArray, lt } from "drizzle-orm";
import { orders, reservations } from "../../../../db/schema";
import { AuthError, requireAdmin, toErrorResponse } from "../../../../lib/admin-routes";

export async function GET(request: Request) {
  try {
    const db = await requireAdmin(request);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const todayOrders = await db
      .select()
      .from(orders)
      .where(and(gte(orders.createdAt, startOfDay), lt(orders.createdAt, endOfDay)));

    const revenueCents = todayOrders
      .filter((order) => order.status !== "cancelled" && order.paymentStatus === "paid")
      .reduce((sum, order) => sum + order.totalCents, 0);

    const activeOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.status, ["new", "preparing", "ready"]));

    const pendingReservations = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(inArray(reservations.status, ["pending", "confirmed"]), gte(reservations.dateTime, now)));

    const recentOrders = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(5);

    const upcomingReservations = await db
      .select()
      .from(reservations)
      .where(gte(reservations.dateTime, now))
      .orderBy(asc(reservations.dateTime))
      .limit(5);

    return Response.json({
      stats: {
        todayOrders: todayOrders.length,
        revenueCents,
        activeOrders: activeOrders.length,
        pendingReservations: pendingReservations.length,
        recentOrders: recentOrders.map((order) => ({
          ...order,
          items: JSON.parse(order.items) as unknown,
        })),
        upcomingReservations,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}
