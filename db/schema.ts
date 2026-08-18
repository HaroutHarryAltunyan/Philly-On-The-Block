import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const menuItems = sqliteTable(
  "menu_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    priceCents: integer("price_cents").notNull(),
    badge: text("badge").notNull().default(""),
    image: text("image").notNull().default(""),
    imagePosition: text("image_position").notNull().default(""),
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    stockQty: integer("stock_qty"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("menu_items_category_idx").on(table.category),
    index("menu_items_stock_idx").on(table.stockQty),
  ],
);

export const menuItemOptions = sqliteTable(
  "menu_item_options",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    menuItemId: integer("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("menu_item_options_item_idx").on(table.menuItemId)],
);

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderNumber: text("order_number").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    phoneKey: text("phone_key").notNull().default(""),
    email: text("email").notNull().default(""),
    address: text("address").notNull().default(""),
    fulfillment: text("fulfillment", { enum: ["pickup", "delivery"] }).notNull(),
    items: text("items").notNull(),
    notes: text("notes").notNull().default(""),
    subtotalCents: integer("subtotal_cents").notNull(),
    serviceFeeCents: integer("service_fee_cents").notNull(),
    deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    couponCode: text("coupon_code").notNull().default(""),
    totalCents: integer("total_cents").notNull(),
    status: text("status", {
      enum: ["new", "preparing", "ready", "delivering", "completed", "cancelled"],
    })
      .notNull()
      .default("new"),
    destLat: text("dest_lat").notNull().default(""),
    destLng: text("dest_lng").notNull().default(""),
    driverId: integer("driver_id"),
    driverLat: text("driver_lat").notNull().default(""),
    driverLng: text("driver_lng").notNull().default(""),
    driverUpdatedAt: integer("driver_updated_at", { mode: "timestamp" }),
    paymentStatus: text("payment_status", {
      enum: ["unpaid", "paid", "refunded"],
    })
      .notNull()
      .default("unpaid"),
    paymentMethod: text("payment_method").notNull().default(""),
    stripeSessionId: text("stripe_session_id").notNull().default(""),
    pointsEarned: integer("points_earned").notNull().default(0),
    pointsRedeemed: integer("points_redeemed").notNull().default(0),
    pointsDiscountCents: integer("points_discount_cents").notNull().default(0),
    // JSON array of the menu lines actually decremented for this order (same
    // shape as `items`). Empty means no stock is reserved. Cancel/expire must
    // restore exactly this list — never the full item list, or lines that were
    // never decremented (e.g. sold out at payment time) would be inflated.
    stockDecremented: text("stock_decremented").notNull().default(""),
    paidAt: integer("paid_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("orders_status_idx").on(table.status),
    index("orders_created_at_idx").on(table.createdAt),
    index("orders_phone_key_idx").on(table.phoneKey),
  ],
);

export const reservations = sqliteTable(
  "reservations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull().default(""),
    eventType: text("event_type").notNull().default(""),
    partySize: integer("party_size").notNull(),
    dateTime: integer("date_time", { mode: "timestamp" }).notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status", { enum: ["pending", "confirmed", "cancelled"] })
      .notNull()
      .default("pending"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("reservations_date_time_idx").on(table.dateTime)],
);

export const settings = sqliteTable(
  "settings",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
  },
  (table) => [uniqueIndex("settings_key_idx").on(table.key)],
);

export const couponTypes = ["percent", "fixed"] as const;
export type CouponType = (typeof couponTypes)[number];

export const coupons = sqliteTable(
  "coupons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    type: text("type", { enum: couponTypes }).notNull(),
    amount: integer("amount").notNull(),
    minSubtotalCents: integer("min_subtotal_cents").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("coupons_code_idx").on(table.code)],
);

export const drivers = sqliteTable(
  "drivers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("drivers_phone_idx").on(table.phone)],
);

export const subscribers = sqliteTable(
  "subscribers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("subscribers_email_idx").on(table.email)],
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(1),
    windowStart: integer("window_start").notNull(),
  },
);

export const broadcasts = sqliteTable(
  "broadcasts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    couponCode: text("coupon_code").notNull().default(""),
    recipientCount: integer("recipient_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    status: text("status", { enum: ["sent", "failed"] }).notNull(),
    sentAt: integer("sent_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
);
