import { formatClock } from "./hours";
import { BRAND_ALIASES, SERVICE_AREAS, SITE_NAME, SITE_URL, SOCIAL_PROFILES, STORE_PHONE_TEL } from "./site";
import { WEEK_DAYS, type StoreMenuItem, type WeeklyHours } from "./storefront";

export const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Where can I get the best Philly cheesesteak in Burbank?",
    a: "Philly on the Block at 2600 W Victory Blvd, Burbank, CA 91505. Every cheesesteak is hand-chopped to order on freshly baked bread with premium meat, grilled onions, and sharp white American — order online for pickup or delivery.",
  },
  {
    q: "What’s on a Philly OTB cheesesteak?",
    a: "Our house favorite: freshly baked bread, premium meat, grilled onions, spicy pepper, sharp white American, and both house sauces — OTB Ranch and OTB Tang. Prefer it simple? The Classic Philly is meat, grilled onions, and sharp white American.",
  },
  {
    q: "Do you deliver cheesesteaks near me?",
    a: "Yes. We deliver around Burbank and nearby neighborhoods including Glendale, North Hollywood, Toluca Lake, Studio City, and Universal City. Order on this site, choose Delivery, and track your driver live.",
  },
  {
    q: "What are your hours?",
    a: "Tuesday–Friday 12 PM–9 PM and Saturday–Sunday 4 PM–11 PM for late-night cheesesteaks. Closed Mondays. Live hours are always shown on our Visit page.",
  },
  {
    q: "Do you cater events?",
    a: "Yes — cheesesteak catering for birthdays, office lunches, film and studio sets, and private parties around Burbank and the San Fernando Valley. Request a date on our events page.",
  },
  {
    q: "How do I pay?",
    a: "Order online, then pay in person — cash or card — at pickup or when your delivery arrives.",
  },
  {
    q: "How do rewards work?",
    a: "Every paid order earns 4 points per $1 (that’s $1 back per $25). Redeem at checkout: 100 points = $1 off. Points follow the phone number on your orders.",
  },
];

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function openingHoursSpecification(hours: WeeklyHours) {
  // Group days that share the same window, e.g. Tue–Fri 12:00–21:00.
  const groups = new Map<string, string[]>();
  for (const day of WEEK_DAYS) {
    const window = hours[day];
    if (!window) continue;
    const key = `${hhmm(window[0])}-${hhmm(window[1])}`;
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  return [...groups.entries()].map(([key, days]) => {
    const [opens, closes] = key.split("-");
    return { "@type": "OpeningHoursSpecification", dayOfWeek: days, opens, closes };
  });
}

/** "Tue–Fri 12 PM–9 PM" style lines for display. */
export function hoursLines(hours: WeeklyHours): Array<{ day: string; label: string }> {
  return WEEK_DAYS.map((day) => {
    const window = hours[day];
    return { day, label: window ? `${formatClock(window[0])}–${formatClock(window[1])}` : "Closed" };
  });
}

export function restaurantSchema(hours: WeeklyHours) {
  return {
    "@context": "https://schema.org",
    "@type": ["Restaurant", "FoodEstablishment"],
    "@id": `${SITE_URL}/#restaurant`,
    name: SITE_NAME,
    alternateName: BRAND_ALIASES,
    description:
      "Hand-chopped Philly cheesesteaks, loaded OTB Fries, and cold Cokes at 2600 W Victory Blvd in Burbank, California. Pickup, delivery, and cheesesteak catering.",
    url: SITE_URL,
    logo: `${SITE_URL}/images/Philly_On_The_Block_Logo.png`,
    image: [`${SITE_URL}/og.png`, `${SITE_URL}/images/menu/classic-philly.jpg`, `${SITE_URL}/images/menu/otb-fries.jpg`],
    telephone: STORE_PHONE_TEL,
    servesCuisine: ["Cheesesteaks", "Philly Cheesesteak", "Sandwiches", "American"],
    priceRange: "$$",
    currenciesAccepted: "USD",
    paymentAccepted: "Cash, Credit Card",
    acceptsReservations: "True",
    hasMenu: `${SITE_URL}/menu`,
    address: {
      "@type": "PostalAddress",
      streetAddress: "2600 W Victory Blvd",
      addressLocality: "Burbank",
      addressRegion: "CA",
      postalCode: "91505",
      addressCountry: "US",
    },
    geo: { "@type": "GeoCoordinates", latitude: 34.1841, longitude: -118.3396 },
    hasMap: "https://www.google.com/maps/search/?api=1&query=Philly+on+the+Block+2600+W+Victory+Blvd+Burbank+CA+91505",
    areaServed: SERVICE_AREAS.map((name) => ({ "@type": "City", name })),
    openingHoursSpecification: openingHoursSpecification(hours),
    potentialAction: {
      "@type": "OrderAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/menu`,
        actionPlatform: ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform"],
      },
      deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModePickUp", "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet"],
    },
    sameAs: Object.values(SOCIAL_PROFILES),
  };
}

export function menuSchema(menu: StoreMenuItem[]) {
  const sections = [...new Set(menu.map((item) => item.category))];
  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": `${SITE_URL}/menu#menu`,
    name: "Philly on the Block Cheesesteak Menu",
    url: `${SITE_URL}/menu`,
    inLanguage: "en-US",
    hasMenuSection: sections.map((section) => ({
      "@type": "MenuSection",
      name: section,
      hasMenuItem: menu
        .filter((item) => item.category === section)
        .map((item) => ({
          "@type": "MenuItem",
          name: item.name,
          description: item.description,
          image: item.image.startsWith("http") ? item.image : `${SITE_URL}${item.image}`,
          offers: { "@type": "Offer", price: item.price.toFixed(2), priceCurrency: "USD" },
        })),
    })),
  };
}

export function faqSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({ "@type": "Question", name: faq.q, acceptedAnswer: { "@type": "Answer", text: faq.a } })),
  };
}

export function jsonLd(data: unknown): { __html: string } {
  // Escape "<" so a value can never close the <script> element early.
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
