import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";
import { DEFAULT_PASSCODE, seedMenuItems } from "./seed";

const TABLES: Array<{ name: string; ddl: string }> = [
  {
    name: "menu_items",
    ddl: `CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL,
      badge TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      image_position TEXT NOT NULL DEFAULT '',
      available INTEGER NOT NULL DEFAULT 1,
      stock_qty INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
  },
  {
    name: "menu_item_options",
    ddl: `CREATE TABLE IF NOT EXISTS menu_item_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
  },
  {
    name: "orders",
    ddl: `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      fulfillment TEXT NOT NULL,
      items TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      subtotal_cents INTEGER NOT NULL,
      service_fee_cents INTEGER NOT NULL,
      delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
      tax_cents INTEGER NOT NULL,
      discount_cents INTEGER NOT NULL DEFAULT 0,
      coupon_code TEXT NOT NULL DEFAULT '',
      total_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      driver_id INTEGER,
      dest_lat TEXT NOT NULL DEFAULT '',
      dest_lng TEXT NOT NULL DEFAULT '',
      driver_lat TEXT NOT NULL DEFAULT '',
      driver_lng TEXT NOT NULL DEFAULT '',
      driver_updated_at INTEGER,
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      payment_method TEXT NOT NULL DEFAULT '',
      stripe_session_id TEXT NOT NULL DEFAULT '',
      paid_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
  },
  {
    name: "reservations",
    ddl: `CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      party_size INTEGER NOT NULL,
      date_time INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    )`,
  },
  {
    name: "settings",
    ddl: `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  },
  {
    name: "coupons",
    ddl: `CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )`,
  },
  {
    name: "drivers",
    ddl: `CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    )`,
  },
];

const UNIQUE_INDEXES: Array<{ name: string; ddl: string }> = [
  {
    name: "coupons_code_idx",
    ddl: "CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_idx ON coupons (code)",
  },
  {
    name: "drivers_phone_idx",
    ddl: "CREATE UNIQUE INDEX IF NOT EXISTS drivers_phone_idx ON drivers (phone)",
  },
];

const COLUMN_UPGRADES: Array<{ table: string; column: string; ddl: string }> = [
  {
    table: "menu_items",
    column: "stock_qty",
    ddl: "ALTER TABLE menu_items ADD COLUMN stock_qty INTEGER",
  },
  {
    table: "orders",
    column: "notes",
    ddl: "ALTER TABLE orders ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "orders",
    column: "delivery_fee_cents",
    ddl: "ALTER TABLE orders ADD COLUMN delivery_fee_cents INTEGER NOT NULL DEFAULT 0",
  },
  {
    table: "orders",
    column: "discount_cents",
    ddl: "ALTER TABLE orders ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0",
  },
  {
    table: "orders",
    column: "coupon_code",
    ddl: "ALTER TABLE orders ADD COLUMN coupon_code TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "orders",
    column: "driver_id",
    ddl: "ALTER TABLE orders ADD COLUMN driver_id INTEGER",
  },
  {
    table: "orders",
    column: "dest_lat",
    ddl: "ALTER TABLE orders ADD COLUMN dest_lat TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "orders",
    column: "dest_lng",
    ddl: "ALTER TABLE orders ADD COLUMN dest_lng TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "orders",
    column: "driver_lat",
    ddl: "ALTER TABLE orders ADD COLUMN driver_lat TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "orders",
    column: "driver_lng",
    ddl: "ALTER TABLE orders ADD COLUMN driver_lng TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "orders",
    column: "driver_updated_at",
    ddl: "ALTER TABLE orders ADD COLUMN driver_updated_at INTEGER",
  },
  {
    table: "reservations",
    column: "email",
    ddl: "ALTER TABLE reservations ADD COLUMN email TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "reservations",
    column: "event_type",
    ddl: "ALTER TABLE reservations ADD COLUMN event_type TEXT NOT NULL DEFAULT ''",
  },
];

const FEE_SETTINGS: Record<string, string> = {
  serviceFeeCents: "150",
  taxRatePercent: "8",
  deliveryFeeCents: "0",
};

export type Db = DrizzleD1Database<typeof schema>;

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

let bootstrapPromise: Promise<void> | null = null;

export function ensureBootstrap(db: Db): Promise<void> {
  bootstrapPromise ??= bootstrap(db);
  return bootstrapPromise;
}

async function bootstrap(db: Db): Promise<void> {
  for (const table of TABLES) {
    await db.run(sql.raw(table.ddl));
  }

  for (const index of UNIQUE_INDEXES) {
    await db.run(sql.raw(index.ddl));
  }

  for (const upgrade of COLUMN_UPGRADES) {
    const result = (await db.run(sql.raw(`PRAGMA table_info(${upgrade.table})`))) as unknown as {
      results?: Array<{ name: string }>;
    };
    const rows = Array.isArray(result.results) ? result.results : [];
    const hasColumn = rows.some((column) => column.name === upgrade.column);
    if (!hasColumn) {
      try {
        await db.run(sql.raw(upgrade.ddl));
      } catch {
        // column already exists or cannot be added non-atomic; ignore
      }
    }
  }

  const ensureSetting = async (key: string, value: string) => {
    const existing = await db.select().from(schema.settings).where(sql`${schema.settings.key} = ${key}`);
    if (existing.length === 0) {
      await db.insert(schema.settings).values({ key, value });
    }
  };

  await ensureSetting("authSecret", crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""));
  const passcodeSalt = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  await ensureSetting(
    "adminPasscodeHash",
    `${passcodeSalt}$${await sha256Hex(`otb-admin:${passcodeSalt}:${DEFAULT_PASSCODE}`)}`,
  );
  for (const [key, value] of Object.entries(FEE_SETTINGS)) {
    await ensureSetting(key, value);
  }

  const [menuCount] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(schema.menuItems);
  if (menuCount.count === 0) {
    const now = new Date();
    await db.insert(schema.menuItems).values(
      seedMenuItems.map((item, index) => ({ ...item, createdAt: new Date(now.getTime() + index) })),
    );
  }
}