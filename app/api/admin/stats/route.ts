import { and, asc, desc, gte, inArray, lt } from "drizzle-orm";
import { orders, reservations } from "../../../../db/schema";
import { AuthError, requireAdmin, toErrorResponse } from "../../../../lib/admin-routes";
import { restaurantDayBounds } from "../../../../lib/hours";

export async function GET(request: Request) {
  try {
    const db = await requireAdmin(request);

    const now = new Date();
    // "Today" is the restaurant's calendar day, not the Worker's (UTC).
    const { start: startOfDay, end: endOfDay } = restaurantDayBounds(now);

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

    const live = todayOrders.filter((order) => order.status !== "cancelled");
    const sumWhere = (pred: (order: (typeof live)[number]) => boolean) =>
      live.filter(pred).reduce((sum, order) => sum + order.totalCents, 0);

    return Response.json({
      stats: {
        todayOrders: todayOrders.length,
        revenueCents,
        cashCents: sumWhere((o) => o.paymentStatus === "paid" && o.paymentMethod === "cash"),
        cardCents: sumWhere((o) => o.paymentStatus === "paid" && o.paymentMethod === "card_in_person"),
        dueCents: sumWhere((o) => o.paymentStatus === "unpaid"),
        completedDeliveries: live.filter((o) => o.fulfillment === "delivery" && o.status === "completed").length,
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
