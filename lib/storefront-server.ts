import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import {
  FALLBACK_FEES,
  FALLBACK_HOURS,
  FALLBACK_MENU,
  parseWeeklyHours,
  toStoreMenuItem,
  type Storefront,
  type WeeklyHours,
} from "./storefront";

// Server only. Kept out of storefront.ts because client components import
// that module, and the bundler follows the dynamic imports below into D1.

/** Live menu, hours, and fees from D1 (server only). Falls back when D1 is unavailable. */
export async function loadStorefront(): Promise<Storefront> {
  try {
    const [{ getDb }, { ensureBootstrap }, schema, { attachMenuOptions }, { getSetting }, { loadOrderFees }] =
      await Promise.all([
        import("../db"),
        import("../db/bootstrap"),
        import("../db/schema"),
        import("./menu-items"),
        import("./admin-auth"),
        import("./checkout"),
      ]);
    const db = getDb();
    await ensureBootstrap(db);
    const rows = await db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.available, true))
      .orderBy(asc(schema.menuItems.sortOrder), asc(schema.menuItems.id));
    const [items, rawHours, fees] = await Promise.all([
      attachMenuOptions(db, rows),
      getSetting(db, "weeklyHours"),
      loadOrderFees(db),
    ]);
    let hours: WeeklyHours | null = null;
    try {
      hours = rawHours ? parseWeeklyHours(JSON.parse(rawHours)) : null;
    } catch {
      hours = null;
    }
    return {
      menu: items.filter((item) => item.image).map(toStoreMenuItem),
      hours: hours ?? FALLBACK_HOURS,
      fees: {
        serviceFeeCents: Math.round(Number(fees.serviceFeeCents) || 0),
        taxRatePercent: Number(fees.taxRatePercent) || 0,
        deliveryFeeCents: Math.round(Number(fees.deliveryFeeCents) || 0),
      },
      live: true,
    };
  } catch {
    return { menu: FALLBACK_MENU, hours: FALLBACK_HOURS, fees: FALLBACK_FEES, live: false };
  }
}

/** Per-request memoized storefront data for server components. */
export const getStorefront = cache(loadStorefront);
