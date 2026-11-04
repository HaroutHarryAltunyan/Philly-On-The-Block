import type { Metadata } from "next";
import { HoursList, OpenStatus } from "../../components/shop/live-hours";
import VisitMap from "./visit-map";
import { jsonLd, restaurantSchema } from "../../../lib/seo";
import { SITE_NAME, STORE_PHONE_DISPLAY, STORE_PHONE_TEL } from "../../../lib/site";
import { getStorefront } from "../../../lib/storefront-server";

export const metadata: Metadata = {
  title: { absolute: `Hours & Directions, Burbank CA | ${SITE_NAME}` },
  description:
    "Find Philly on the Block at 2600 W Victory Blvd, Burbank, CA 91505. Live hours, directions, and phone. Minutes from Glendale, North Hollywood, Toluca Lake, and Studio City.",
  alternates: { canonical: "/visit" },
};

const DIRECTIONS = "https://www.google.com/maps/dir/?api=1&destination=2600+W+Victory+Blvd%2C+Burbank%2C+CA+91505";
const APPLE_MAPS = "https://maps.apple.com/?daddr=2600+W+Victory+Blvd,+Burbank,+CA+91505";

export default async function VisitPage() {
  const { hours } = await getStorefront();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(restaurantSchema(hours))} />
      <section className="page-hero visit-hero">
        <img className="visit-hero-truck" src="/images/otb-food-truck.webp" alt="" aria-hidden="true" width={1390} height={1017} />
        <p className="eyebrow">Visit</p>
        <h1 className="display-xl">Pull up hungry.</h1>
        <address className="visit-address">
          <a href={DIRECTIONS} target="_blank" rel="noopener noreferrer">2600 W Victory Blvd<br />Burbank, CA 91505</a>
          <a href={`tel:${STORE_PHONE_TEL}`}>{STORE_PHONE_DISPLAY}</a>
        </address>
        <OpenStatus />
      </section>

      <section className="page-body">
        <div className="grid-2">
          <div className="visit-map-card">
            <VisitMap />
            <div className="stack-actions">
              <a className="btn btn-dark" href={DIRECTIONS} target="_blank" rel="noopener noreferrer">Google Maps ↗</a>
              <a className="btn btn-ghost-dark" href={APPLE_MAPS} target="_blank" rel="noopener noreferrer">Apple Maps ↗</a>
              <a className="btn btn-ghost-dark" href={`tel:${STORE_PHONE_TEL}`}>Call {STORE_PHONE_DISPLAY}</a>
            </div>
          </div>
          <div className="form-grid">
            <div>
              <h2 className="display-md">Hours</h2>
              <p className="field-note">Updated live by the kitchen. Times are Pacific.</p>
            </div>
            <HoursList />
            <div className="panel">
              <h2 className="display-sm">Getting here</h2>
              <p>
                We’re at 2600 W Victory Blvd in Burbank, CA 91505 — a few minutes from Glendale, North Hollywood,
                Toluca Lake, Studio City, and Universal City.
              </p>
              <p>
                Ordering ahead? Place a pickup order online and pay in person (cash or card) when you arrive. Not sure
                where to go? Call {STORE_PHONE_DISPLAY}.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
