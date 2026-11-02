import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/bootstrap";
import { deliveryOffers, drivers, orders } from "../db/schema";
import { pushToCustomer, pushToDriver, pushToStaff } from "./push";
import { milesBetween, parseCoordinatePair, STORE_LOCATION } from "./tracking";

// Automatic dispatch.
//
// An unassigned delivery order (new / preparing / ready) is offered to ONE
// online driver at a time. The offer expires after OFFER_TTL_MS; then the
// next-best driver gets it. A driver who declined or let an offer expire is
// not offered the same order again. Staff can still assign anyone, and drivers
// can still claim from the Available list; either one ends the offer.
//
// Uniqueness is enforced by partial unique indexes (one live offer per order,
// one live offer per driver), so concurrent dispatch runs can't double-offer.

export const OFFER_TTL_MS = 60_000;
const ELIGIBLE = ["new", "preparing", "ready"] as const;

type OrderRow = typeof orders.$inferSelect;

export async function runDispatch(db: Db): Promise<{ offered: number }> {
  const now = Date.now();

  // 1. Retire offers that timed out or whose order no longer needs a driver.
  await db.run(sql`UPDATE delivery_offers SET status = 'expired' WHERE status = 'offered' AND expires_at < ${now}`);
  await db.run(
    sql`UPDATE delivery_offers SET status = 'expired'
        WHERE status = 'offered' AND order_id IN (
          SELECT id FROM orders WHERE driver_id IS NOT NULL OR status NOT IN ('new', 'preparing', 'ready')
        )`,
  );

  // 2. Orders that still need a driver and have no live offer.
  const pending = await db
    .select()
    .from(orders)
    .where(
      sql`${orders.fulfillment} = 'delivery' AND ${orders.driverId} IS NULL
          AND ${orders.status} IN ('new', 'preparing', 'ready')
          AND NOT EXISTS (SELECT 1 FROM delivery_offers o WHERE o.order_id = ${orders.id} AND o.status = 'offered')`,
    )
    .orderBy(orders.id)
    .limit(20);
  if (pending.length === 0) return { offered: 0 };

  // 3. Online drivers with their load, position and whether they hold an offer.
  const online = await db.select().from(drivers).where(and(eq(drivers.status, "active"), eq(drivers.online, true)));
  if (online.length === 0) return { offered: 0 };
  const ids = online.map((d) => d.id);
  const carrying = await db
    .select({ driverId: orders.driverId, lat: orders.driverLat, lng: orders.driverLng, at: orders.driverUpdatedAt, status: orders.status })
    .from(orders)
    .where(inArray(orders.driverId, ids));
  const busyOffer = new Set(
    (
      await db
        .select({ driverId: deliveryOffers.driverId })
        .from(deliveryOffers)
        .where(and(eq(deliveryOffers.status, "offered"), inArray(deliveryOffers.driverId, ids)))
    ).map((r) => r.driverId),
  );

  const load = new Map<number, number>();
  const position = new Map<number, { latitude: number; longitude: number; at: number }>();
  for (const row of carrying) {
    if (row.driverId == null) continue;
    if (row.status !== "completed" && row.status !== "cancelled") load.set(row.driverId, (load.get(row.driverId) ?? 0) + 1);
    const coords = parseCoordinatePair(row.lat, row.lng);
    const at = row.at?.getTime() ?? 0;
    if (coords && at >= (position.get(row.driverId)?.at ?? -1)) position.set(row.driverId, { ...coords, at });
  }

  let offered = 0;
  for (const order of pending) {
    const tried = new Set(
      (await db.select({ driverId: deliveryOffers.driverId }).from(deliveryOffers).where(eq(deliveryOffers.orderId, order.id))).map(
        (r) => r.driverId,
      ),
    );
    const candidates = online
      .filter((d) => !tried.has(d.id) && !busyOffer.has(d.id))
      .map((d) => {
        const pos = position.get(d.id);
        return {
          driver: d,
          load: load.get(d.id) ?? 0,
          // Distance to the pickup (the store); unknown position ranks after known.
          miles: pos ? milesBetween(pos, STORE_LOCATION) : Number.POSITIVE_INFINITY,
          waitingSince: d.onlineAt?.getTime() ?? now,
        };
      })
      .sort((a, b) => a.load - b.load || a.miles - b.miles || a.waitingSince - b.waitingSince);
    const best = candidates[0];
    if (!best) continue;

    const result = (await db.run(
      sql`INSERT OR IGNORE INTO delivery_offers (order_id, driver_id, status, expires_at, created_at)
          VALUES (${order.id}, ${best.driver.id}, 'offered', ${now + OFFER_TTL_MS}, ${Math.floor(now / 1000)})`,
    )) as unknown as { meta?: { changes?: number } };
    if ((result.meta?.changes ?? 1) === 0) continue; // lost a race to another dispatch run
    busyOffer.add(best.driver.id);
    offered++;
    await pushToDriver(db, best.driver.id, {
      title: `New delivery ${order.orderNumber}`,
      body: `${order.items ? JSON.parse(order.items).length : 0} items · accept within 60 seconds`,
      data: { type: "offer", orderId: order.id },
    });
  }
  return { offered };
}

/** Live offers for one driver (shown with a countdown in the driver app). */
export async function offersForDriver(db: Db, driverId: number) {
  return db
    .select({ orderId: deliveryOffers.orderId, expiresAt: deliveryOffers.expiresAt })
    .from(deliveryOffers)
    .where(
      and(
        eq(deliveryOffers.driverId, driverId),
        eq(deliveryOffers.status, "offered"),
        sql`${deliveryOffers.expiresAt} >= ${Date.now()}`,
      ),
    );
}

/**
 * Accepts an offer atomically: the order is assigned only if it is still
 * unassigned AND this driver holds a live offer for it.
 */
export async function acceptOffer(db: Db, driverId: number, orderId: number): Promise<OrderRow | null> {
  const now = Date.now();
  const [updated] = await db
    .update(orders)
    .set({ driverId })
    .where(
      sql`${orders.id} = ${orderId} AND ${orders.driverId} IS NULL AND ${orders.status} IN ('new', 'preparing', 'ready')
          AND EXISTS (SELECT 1 FROM delivery_offers o WHERE o.order_id = ${orderId} AND o.driver_id = ${driverId}
                      AND o.status = 'offered' AND o.expires_at >= ${now})`,
    )
    .returning();
  if (!updated) return null;
  await db
    .update(deliveryOffers)
    .set({ status: "accepted" })
    .where(and(eq(deliveryOffers.orderId, orderId), eq(deliveryOffers.driverId, driverId), eq(deliveryOffers.status, "offered")));
  return updated;
}

export async function declineOffer(db: Db, driverId: number, orderId: number): Promise<boolean> {
  const [row] = await db
    .update(deliveryOffers)
    .set({ status: "declined" })
    .where(and(eq(deliveryOffers.orderId, orderId), eq(deliveryOffers.driverId, driverId), eq(deliveryOffers.status, "offered")))
    .returning();
  return Boolean(row);
}

const CUSTOMER_MESSAGES: Partial<Record<OrderRow["status"], (o: OrderRow) => string>> = {
  preparing: () => "The kitchen is making your order.",
  ready: (o) => (o.fulfillment === "pickup" ? "Your order is ready for pickup!" : "Your order is ready and waiting for the driver."),
  delivering: (o) => `Your driver is on the way.${o.deliveryPin ? ` Your delivery code is ${o.deliveryPin}.` : ""}`,
  completed: (o) => (o.fulfillment === "pickup" ? "Enjoy! Thanks for ordering." : "Delivered. Enjoy!"),
  cancelled: () => "Your order was cancelled. Call (818) 406-6053 with any questions.",
};

/** Side effects after any order status/assignment change: notify + redispatch. */
export async function afterOrderChange(db: Db, order: OrderRow, previousStatus?: string): Promise<void> {
  if (previousStatus !== undefined && previousStatus !== order.status) {
    const text = CUSTOMER_MESSAGES[order.status]?.(order);
    if (text) await pushToCustomer(db, order.phoneKey, { title: `Order ${order.orderNumber}`, body: text, data: { type: "order", orderNumber: order.orderNumber } });
  }
  if (order.fulfillment === "delivery" && (ELIGIBLE as readonly string[]).includes(order.status) && order.driverId == null) {
    await runDispatch(db);
  } else {
    // Order left the pool (assigned / cancelled / done): retire its offers.
    await db.run(sql`UPDATE delivery_offers SET status = 'expired' WHERE status = 'offered' AND order_id = ${order.id}`);
  }
}

/** New order placed: alert staff and start dispatch. */
export async function afterOrderPlaced(db: Db, order: OrderRow): Promise<void> {
  await pushToStaff(db, {
    title: `New ${order.fulfillment} order ${order.orderNumber}`,
    body: `${order.name} · $${(order.totalCents / 100).toFixed(2)} · pay in person`,
    data: { type: "new_order", orderId: order.id },
  });
  if (order.fulfillment === "delivery") await runDispatch(db);
}

/** Staff assigned a driver directly: tell the driver. */
export async function afterStaffAssigned(db: Db, order: OrderRow): Promise<void> {
  await db.run(sql`UPDATE delivery_offers SET status = 'expired' WHERE status = 'offered' AND order_id = ${order.id}`);
  if (order.driverId != null) {
    await pushToDriver(db, order.driverId, {
      title: `You've been assigned ${order.orderNumber}`,
      body: order.address,
      data: { type: "assigned", orderId: order.id },
    });
  }
}
