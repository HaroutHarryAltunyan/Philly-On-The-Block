import type { Metadata } from "next";
import { SITE_NAME, SOCIAL_PROFILES, STORE_PHONE_DISPLAY, STORE_PHONE_TEL } from "../../../lib/site";

export const metadata: Metadata = {
  title: { absolute: `Contact — ${SITE_NAME}, Burbank` },
  description: "Call Philly on the Block at (818) 406-6053, visit 2600 W Victory Blvd in Burbank, or message us on Instagram and TikTok.",
  alternates: { canonical: "/contact" },
};

const CARDS = [
  { title: "Call the truck", body: "Questions about an order, hours, or a big pickup.", href: `tel:${STORE_PHONE_TEL}`, cta: STORE_PHONE_DISPLAY, external: false },
  { title: "Track an order", body: "Order number and phone number get you live status.", href: "/track", cta: "Track order", external: false },
  { title: "Events & catering", body: "Parties, office lunches, film and studio sets.", href: "/events", cta: "Request a date", external: false },
  { title: "Find us", body: "2600 W Victory Blvd, Burbank, CA 91505.", href: "/visit", cta: "Hours & map", external: false },
  { title: "Instagram", body: "Drops, specials, and the latest from the block.", href: SOCIAL_PROFILES.instagram, cta: "@philly_ontheblock", external: true },
  { title: "TikTok", body: "Watch it get chopped.", href: SOCIAL_PROFILES.tiktok, cta: "@philly_otb", external: true },
];

export default function ContactPage() {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Contact</p>
        <h1 className="display-xl">Holler at the block.</h1>
        <p className="lede">The fastest way to reach us is a phone call during open hours.</p>
      </section>
      <section className="page-body">
        <ul className="contact-grid">
          {CARDS.map((card) => (
            <li key={card.title}>
              <a className="contact-card" href={card.href} {...(card.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                <h2 className="display-sm">{card.title}</h2>
                <p>{card.body}</p>
                <span className="contact-cta">{card.cta} {card.external ? "↗" : "→"}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
