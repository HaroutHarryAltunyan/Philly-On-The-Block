import type { Metadata } from "next";
import { SITE_NAME, STORE_PHONE_DISPLAY, STORE_PHONE_TEL } from "../../../lib/site";

export const metadata: Metadata = {
  title: { absolute: `Privacy Policy | ${SITE_NAME}` },
  description: "What Philly on the Block collects when you order, sign in, subscribe, or request an event, and how it’s used.",
  alternates: { canonical: "/privacy" },
};

// Describes what this codebase actually collects and where it goes. Review
// with the owner (and counsel, if needed) whenever data handling changes.
export default function PrivacyPage() {
  return (
    <>
      <section className="page-hero page-hero-blue">
        <p className="eyebrow">Legal</p>
        <h1 className="display-xl">Privacy policy.</h1>
        <p className="lede">Last updated November 3, 2026.</p>
      </section>
      <section className="page-body page-body-cream">
        <div className="prose narrow">
          <p>
            This policy explains what Philly on the Block (“we”) collects through phillyontheblock.com and our apps, and
            how we use it. We collect only what we need to make and deliver your food.
          </p>

          <h2>What we collect</h2>
          <ul>
            <li><strong>Orders:</strong> your name, phone number, optional email, the items you order, kitchen notes, and — for delivery — your address.</li>
            <li><strong>Accounts:</strong> if you sign in, your email address, and the name and phone number you save to your profile.</li>
            <li><strong>Rewards:</strong> points are tied to the phone number on your orders.</li>
            <li><strong>Event requests:</strong> your name, email, phone, and the event details you send.</li>
            <li><strong>Email list:</strong> your email address, if you subscribe.</li>
            <li><strong>Technical data:</strong> your IP address is used briefly to limit abuse (rate limiting). Your bag is saved in your own browser so it survives a refresh.</li>
          </ul>

          <h2>How we use it</h2>
          <ul>
            <li>To prepare, deliver, and let you track your order, and to contact you about it.</li>
            <li>To calculate delivery fees and show your driver where to go.</li>
            <li>To keep your rewards balance and order history.</li>
            <li>To reply to event requests and send the updates you subscribed to.</li>
          </ul>
          <p>We don’t sell your personal information.</p>

          <h2>Who else handles it</h2>
          <ul>
            <li><strong>Cloudflare</strong> hosts the website and database, and sends our emails (sign-in links and subscriber updates).</li>
            <li><strong>OpenStreetMap (Nominatim)</strong> converts delivery addresses into map coordinates. Map tiles also load from OpenStreetMap.</li>
            <li><strong>Expo</strong> delivers push notifications if you use our app and allow them.</li>
            <li><strong>Meta (Facebook)</strong> may receive page-view and order events through the Meta Pixel when it’s enabled, to measure our ads.</li>
          </ul>
          <p>
            Your delivery driver sees your name, address, phone number, and order so they can deliver it. While your
            delivery is on the way, you can see the driver’s location on the tracking page.
          </p>

          <h2>Cookies and storage</h2>
          <p>
            Signing in sets a secure cookie that keeps you signed in for up to 30 days. Your bag is kept in your
            browser’s local storage. If the Meta Pixel is enabled, Meta may set its own cookies.
          </p>

          <h2>Your choices</h2>
          <ul>
            <li>You can order without an account.</li>
            <li>You can sign out of every device from your account page.</li>
            <li>To stop subscriber emails, or to ask us to see, correct, or delete your information, call {STORE_PHONE_DISPLAY}.</li>
          </ul>

          <h2>Contact</h2>
          <p>
            Philly on the Block, 2600 W Victory Blvd, Burbank, CA 91505 · <a className="inline-link" href={`tel:${STORE_PHONE_TEL}`}>{STORE_PHONE_DISPLAY}</a>
          </p>
        </div>
      </section>
    </>
  );
}
