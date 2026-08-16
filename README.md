# Philly on the Block

A bold, responsive restaurant ordering experience for Philly on the Block, built around the official street-sign, mascot, food-truck, and neighborhood artwork.

- **Customer site** (`/`) — menu, cart with add-on options, sold-out tracking, pickup/delivery, coupon codes, order notes, Stripe checkout, order tracking (`/track` — with phone-based recent order lookup)
- **Reservations** (`/reserve`) — customers book tables online; requests land in the dashboard as pending
- **Restaurant dashboard** (`/dashboard`) — live orders with payment status, menu management (add-on options + stock counts), coupons, reservations, hours, configurable pricing, passcode login

## Local development

```bash
npm install
npm run dev
```

The database bootstraps automatically on first run (tables + seeded menu). The customer checkout works in demo mode without payment keys; orders land in `/dashboard` immediately.

## Dashboard passcode

Local development (`localhost`) uses the default passcode `philly123`. Because this repo is public, that passcode **never works on the production domain** — login there returns 403 until you set your own.

First-run (or recovery) uses a one-time setup token:

```bash
# 1. Generate a random token and store it in D1 (replaces any previous one)
TOKEN=$(openssl rand -hex 16)
npx wrangler d1 execute philly-on-the-block --command \
  "INSERT OR REPLACE INTO settings (key, value) VALUES ('setupToken', '$TOKEN');"

# 2. Set your passcode (min 8 characters). The token is consumed on success.
curl -X POST https://admin.phillyontheblock.com/api/admin/setup \
  -H 'Content-Type: application/json' \
  -d "{\"setupToken\": \"$TOKEN\", \"passcode\": \"your-new-passcode\"}"
```

After that, log in at `https://admin.phillyontheblock.com/dashboard/login` with your new passcode. You can also change the passcode anytime in **Dashboard → Settings**.

## Pricing

Fees are configurable in **Dashboard → Settings**: service fee (flat per order), delivery fee (flat per delivery order), and tax rate (percent of the discounted subtotal). Menu items can have **add-on options** (e.g. "Extra meat +$4.50") and an optional **stock count** — stock is decremented when payment is confirmed (immediately in demo mode), is restored when the order is cancelled, and items at 0 are shown "Sold out" on the customer site.

## Coupons

Create discount codes in **Dashboard → Coupons** (`/dashboard/coupons`). Coupons are percent-off or fixed-dollar, can require a minimum subtotal, and can be paused. Customers apply them at checkout; the server re-validates and recomputes the discount at order time.

## Stripe payments

Checkout uses [Stripe Checkout](https://stripe.com/payments/checkout) (hosted payment page — no card data touches your server).

1. Create a Stripe account and open your test API keys at https://dashboard.stripe.com/test/apikeys
2. Copy `.dev.vars.example` to `.dev.vars` and set `STRIPE_SECRET_KEY` (test mode)
3. For webhook events locally, run: `npx stripe listen --forward-to localhost:3000/api/stripe/webhook` and copy the printed `whsec_...` into `.dev.vars` as `STRIPE_WEBHOOK_SECRET` (restart `npm run dev`)

Without a key, checkout falls back to demo mode (orders are created and shown as `Demo` payment in the dashboard).

When deploying to Cloudflare, set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as Worker secrets, and point a webhook at `https://<your-domain>/api/stripe/webhook` (listen for `checkout.session.completed`).

## Database

Tables are created and seeded automatically on first use; new columns are added to existing databases on boot. To regenerate migrations after schema changes:

```bash
npm run db:generate
```

## Production build

```bash
npm run build
```
