import HeroScene from "../components/cinematic/hero-scene";
import IngredientStory from "../components/cinematic/ingredient-story";
import MagneticLink from "../components/cinematic/magnetic";
import { Reveal, RevealWords } from "../components/cinematic/reveal";
import { HoursList, OpenStatus } from "../components/shop/live-hours";
import MenuGrid from "../components/shop/menu-grid";
import { FAQS, faqSchema, jsonLd, menuSchema, restaurantSchema } from "../../lib/seo";
import { SOCIAL_PROFILES, STORE_PHONE_DISPLAY, STORE_PHONE_TEL } from "../../lib/site";
import { getStorefront } from "../../lib/storefront-server";

const DIRECTIONS = "https://www.google.com/maps/dir/?api=1&destination=2600+W+Victory+Blvd%2C+Burbank%2C+CA+91505";

export default async function Home() {
  const { menu, hours } = await getStorefront();
  // "Today's move" ticket in the hero: the house favorite, priced from the live menu.
  const featured = menu.find((item) => item.name === "Philly OTB") ?? menu.find((item) => item.badge) ?? menu[0];
  const feature = featured
    ? { name: featured.name, price: featured.price, description: "Sharp white American · OTB Ranch + Tang" }
    : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(restaurantSchema(hours))} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(menuSchema(menu))} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqSchema())} />

      <HeroScene feature={feature}>
        <p className="eyebrow hero-in" style={{ "--d": "0.5s" } as React.CSSProperties}>
          Philly on the Block · Burbank, CA
        </p>
        <h1 id="hero-title" className="display-hero">
          <span className="sr-only">Philly cheesesteaks in Burbank, CA — </span>
          <span className="hero-line hero-in" style={{ "--d": "0.7s" } as React.CSSProperties}>Built on</span>{" "}
          <span className="hero-line hero-line-accent hero-in" style={{ "--d": "0.85s" } as React.CSSProperties}>the block.</span>
        </h1>
        <p className="hero-sub hero-in" style={{ "--d": "1.05s" } as React.CSSProperties}>
          Hand-chopped cheesesteaks. Fresh bread. Real flavor.
        </p>
        <div className="hero-ctas hero-in" style={{ "--d": "1.2s" } as React.CSSProperties}>
          <MagneticLink className="btn btn-primary btn-lg" href="/menu">
            Order now <span aria-hidden="true">→</span>
          </MagneticLink>
          <a className="btn btn-glass btn-lg" href="#menu">Explore the menu</a>
        </div>
        <div className="hero-meta hero-in" style={{ "--d": "1.35s" } as React.CSSProperties}>
          <OpenStatus />
          <span>Pickup · Delivery · Pay in person</span>
        </div>
      </HeroScene>

      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          {Array.from({ length: 2 }).map((_, copy) => (
            <span key={copy}>
              Hot <b>✦</b> Fresh <b>✦</b> Chopped <b>✦</b> Built on the block <b>✦</b> OTB Ranch + OTB Tang <b>✦</b> No shortcuts <b>✦</b>{" "}
            </span>
          ))}
        </div>
      </div>

      <IngredientStory />

      <section id="menu" className="section section-blue" aria-labelledby="menu-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">The main event</p>
            <RevealWords id="menu-title" className="display-xl" text="Choose your damage." />
          </div>
          <Reveal className="section-aside">
            <p>
              Live prices from the kitchen. Order for pickup or delivery and pay in person.{" "}
              <a className="inline-link" href={SOCIAL_PROFILES.yelp} target="_blank" rel="noopener noreferrer">See our Yelp reviews ↗</a>
            </p>
          </Reveal>
        </div>
        <MenuGrid />
      </section>

      <section className="section section-ink story-teaser" aria-labelledby="story-title">
        <div className="story-teaser-art" aria-hidden="true">
          <img src="/images/otb-mascot-right.png" alt="" loading="lazy" decoding="async" width={1005} height={1329} />
        </div>
        <div className="story-teaser-copy">
          <p className="eyebrow">Our story</p>
          <RevealWords id="story-title" className="display-xl" text="No shortcuts. No soft opinions." />
          <Reveal>
            <p className="lede">
              A focused menu: cheesesteaks, seasoned fries, and cold Cokes. Freshly baked bread, premium meat, grilled
              onions, sharp white American, OTB Ranch, and OTB Tang do the heavy lifting.
            </p>
            <a className="btn btn-light" href="/our-story">Read the story</a>
          </Reveal>
        </div>
      </section>

      <section className="section section-green events-teaser" aria-labelledby="events-title">
        <div>
          <p className="eyebrow">Events &amp; catering</p>
          <RevealWords id="events-title" className="display-xl" text="Bring the block to your event." />
          <Reveal>
            <p className="lede">Cheesesteaks for the whole crew — private parties, office lunches, birthdays, and film and studio sets.</p>
            <a className="btn btn-cream" href="/events">Request a date</a>
          </Reveal>
        </div>
        <img className="events-teaser-truck" src="/images/otb-food-truck.png" alt="The Philly on the Block food truck" loading="lazy" decoding="async" width={1390} height={1017} />
      </section>

      <section className="section section-cream faq" aria-labelledby="faq-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Burbank cheesesteak FAQ</p>
            <h2 id="faq-title" className="display-xl">Good questions.</h2>
          </div>
          <p className="section-aside">
            Hand-chopped cheesesteaks, loaded cheesesteak fries, and cold Cokes at 2600 W Victory Blvd in Burbank —
            minutes from Glendale, North Hollywood, Toluca Lake, Studio City, and Universal City.
          </p>
        </div>
        <div className="faq-list">
          {FAQS.map((faq) => (
            <details key={faq.q}>
              <summary>
                <h3>{faq.q}</h3>
                <span aria-hidden="true" />
              </summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="section section-blue visit-strip" id="visit" aria-labelledby="visit-title">
        <div>
          <p className="eyebrow">Find the block</p>
          <RevealWords id="visit-title" className="display-xl" text="Pull up hungry." />
          <address className="visit-address">
            <a href={DIRECTIONS} target="_blank" rel="noopener noreferrer">2600 W Victory Blvd<br />Burbank, CA 91505</a>
            <a href={`tel:${STORE_PHONE_TEL}`}>{STORE_PHONE_DISPLAY}</a>
          </address>
          <HoursList />
          <div className="stack-actions visit-actions-row">
            <a className="btn btn-dark" href={DIRECTIONS} target="_blank" rel="noopener noreferrer">Get directions ↗</a>
            <a className="btn btn-ghost-dark" href="/visit">Map &amp; details</a>
          </div>
        </div>
        {/* The original site's illustrated street map: Victory Blvd x Buena Vista, the truck, and the P/B pin. */}
        <a className="map-card" href={DIRECTIONS} target="_blank" rel="noopener noreferrer" aria-label="Directions to 2600 W Victory Blvd, Burbank, CA 91505 (opens Google Maps)">
          <img className="visit-truck" src="/images/otb-food-truck.png" alt="" loading="lazy" decoding="async" width={1390} height={1017} />
          <span className="map-road road-one" aria-hidden="true">W Victory Blvd</span>
          <span className="map-road road-two" aria-hidden="true">Burbank, CA</span>
          <span className="map-road road-three" aria-hidden="true">91505</span>
          <span className="map-road road-four" aria-hidden="true">N Buena Vista St</span>
          <span className="map-pin" aria-hidden="true"><span>P/B</span></span>
          <strong aria-hidden="true">2600 W<br />Victory Blvd.</strong>
        </a>
      </section>
    </>
  );
}
