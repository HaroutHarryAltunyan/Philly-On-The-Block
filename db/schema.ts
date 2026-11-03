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
    // 4-digit proof-of-delivery code shown to the customer; the driver must
    // enter it to mark a delivery complete. Empty for pickup/legacy orders.
    deliveryPin: text("delivery_pin").notNull().default(""),
    // Signed-in customer who placed the order (null for guest checkout).
    customerId: integer("customer_id"),
    paidAt: integer("paid_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("orders_status_idx").on(table.status),
    index("orders_created_at_idx").on(table.createdAt),
    index("orders_phone_key_idx").on(table.phoneKey),
    index("orders_customer_idx").on(table.customerId),
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
    location: text("location").notNull().default(""),
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
    // Bumped on logout, password change and deactivation; tokens carry the
    // version they were issued at, so bumping it revokes every live session.
    sessionVersion: integer("session_version").notNull().default(0),
    online: integer("online", { mode: "boolean" }).notNull().default(false),
    onlineAt: integer("online_at", { mode: "timestamp" }),
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

// Individually revoked admin session tokens (e.g. a staff phone signing out)
// so one device can sign out without rotating every staff session.
export const revokedSessions = sqliteTable("revoked_sessions", {
  jti: text("jti").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
});

export const staffRoles = ["owner", "manager", "kitchen"] as const;
export type StaffRole = (typeof staffRoles)[number];

// Per-person staff logins. The legacy shared passcode still signs in as the
// owner, so nobody is locked out when accounts are introduced.
export const staffUsers = sqliteTable(
  "staff_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: staffRoles }).notNull().default("kitchen"),
    // Base32 TOTP secret; empty = two-factor off. Pending holds a secret
    // during setup until the first code confirms it.
    totpSecret: text("totp_secret").notNull().default(""),
    totpPending: text("totp_pending").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("staff_users_username_idx").on(table.username)],
);

// Who did what: every sensitive staff/driver action is recorded here.
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actor: text("actor").notNull(),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull().default(""),
    detail: text("detail").notNull().default(""),
    ip: text("ip").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("audit_logs_created_at_idx").on(table.createdAt)],
);

// Dispatch offers: an unassigned delivery is offered to one online driver at
// a time; it expires after a short window and moves to the next driver.
export const deliveryOffers = sqliteTable(
  "delivery_offers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id").notNull(),
    driverId: integer("driver_id").notNull(),
    status: text("status", { enum: ["offered", "accepted", "declined", "expired"] }).notNull().default("offered"),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("delivery_offers_order_idx").on(table.orderId),
    index("delivery_offers_driver_idx").on(table.driverId),
  ],
);

// Expo push tokens per device. Staff tokens get new-order alerts, driver
// tokens get offers/assignments, customer tokens get their order updates.
export const pushTokens = sqliteTable(
  "push_tokens",
  {
    token: text("token").primaryKey(),
    kind: text("kind", { enum: ["staff", "driver", "customer"] }).notNull(),
    driverId: integer("driver_id"),
    phoneKey: text("phone_key").notNull().default(""),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("push_tokens_kind_idx").on(table.kind)],
);

// Customer accounts. Sign-in is passwordless: a one-time link is emailed and
// the account is created on first successful sign-in. Points stay keyed by
// phone (see lib/points.ts); the profile phone is the one shown in the account.
export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    phone: text("phone").notNull().default(""),
    phoneKey: text("phone_key").notNull().default(""),
    // Bumped on "sign out everywhere" so every issued session stops verifying.
    sessionVersion: integer("session_version").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  },
  (table) => [uniqueIndex("customers_email_idx").on(table.email)],
);

// One-time sign-in links. Only a SHA-256 of the token is stored.
export const customerLoginTokens = sqliteTable(
  "customer_login_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("customer_login_tokens_email_idx").on(table.email)],
);
