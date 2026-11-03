import type { Metadata } from "next";
import { SITE_NAME, STORE_PHONE_DISPLAY, STORE_PHONE_TEL } from "../../../lib/site";

export const metadata: Metadata = {
  title: { absolute: `Terms of Service | ${SITE_NAME}` },
  description: "Terms for ordering from Philly on the Block online: pricing, paying in person, pickup and delivery, rewards, and coupons.",
  alternates: { canonical: "/terms" },
};

// Mirrors how ordering actually works in this codebase (pay in person, server
// pricing, points rules). Review with the owner whenever those change.
export default function TermsPage() {
  return (
    <>
      <section className="page-hero page-hero-blue">
        <p className="eyebrow">Legal</p>
        <h1 className="display-xl">Terms of service.</h1>
        <p className="lede">Last updated November 3, 2026.</p>
      </section>
      <section className="page-body page-body-cream">
        <div className="prose narrow">
          <p>By ordering from phillyontheblock.com or our apps, you agree to these terms.</p>

          <h2>Orders and prices</h2>
          <p>
            Menu items, prices, fees, and tax are set by the restaurant and confirmed when you place your order; the
            total shown at checkout is the amount due. Items can sell out. If something in your bag sells out before
            you check out, we’ll ask you to remove it.
          </p>

          <h2>Paying</h2>
          <p>
            Online orders are paid in person — cash or card — when you pick up or when your delivery arrives. Please
            bring the order total shown on your confirmation.
          </p>

          <h2>Pickup and delivery</h2>
          <p>
            Ready times are estimates. The delivery fee depends on
            distance from the truck. For delivery, the driver may ask for the 4-digit code shown on your tracking page to confirm the
            handoff.
          </p>

          <h2>Rewards and coupons</h2>
          <p>
            Paid orders earn 4 points per $1 of subtotal. 100 points are worth $1 off a future order. Points follow the
            phone number on your orders, have no cash value, and are removed if an order is cancelled. Coupons apply
            only as described when issued, can’t be combined unless stated, and may be withdrawn.
          </p>

          <h2>Accounts</h2>
          <p>
            Accounts use one-time sign-in links sent by email. Keep access to your email secure; anyone who can open
            your sign-in link can access your account.
          </p>

          <h2>Event requests</h2>
          <p>An event request isn’t a booking until we confirm it with you.</p>

          <h2>Contact</h2>
          <p>
            Questions about an order? Call <a className="inline-link" href={`tel:${STORE_PHONE_TEL}`}>{STORE_PHONE_DISPLAY}</a>.
          </p>
        </div>
      </section>
    </>
  );
}
