import { STORE_LOCATION } from "./tracking";

// Food truck location: 2600 W Victory Blvd, Burbank, CA 91505
const TRUCK_LAT = STORE_LOCATION.latitude;
const TRUCK_LNG = STORE_LOCATION.longitude;
const CENTS_PER_MILE = 300;

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type DeliveryQuote = {
  miles: number;
  billableMiles: number;
  feeCents: number;
};

// Nominatim hard-limits to ~1 request/second per client, and all requests
// egress from the same worker IPs, so typing bursts get rate-limited. Cache
// successful quotes in memory and retry 429s with exponential backoff so repeat
// lookups don't fail and wipe the customer's fee off the page.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 250;
const quoteCache = new Map<string, { quote: DeliveryQuote; expiresAt: number }>();

async function fetchGeocode(address: string, retryCount: number = 0): Promise<Response> {
  const maxRetries = 3;
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
    {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "PhillyOnTheBlock/0.1 (restaurant delivery fee lookup)",
      },
    },
  );
  if (response.status === 429 && retryCount < maxRetries) {
    const delay = Math.min(1000 * 2 ** retryCount, 5000); // Exponential backoff
    await new Promise((resolve) => setTimeout(resolve, delay));
    return fetchGeocode(address, retryCount + 1);
  }
  return response;
}

export async function computeDeliveryFeeCents(
  address: string,
): Promise<DeliveryQuote | null> {
  const key = address.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;

  const cached = quoteCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.quote;

  try {
    const geoRes = await fetchGeocode(key);
    if (!geoRes.ok) return null;

    const geoData = (await geoRes.json()) as Array<{ lat?: string; lon?: string }>;
    if (!geoData.length || !geoData[0]?.lat || !geoData[0]?.lon) return null;

    const miles = haversine(
      TRUCK_LAT,
      TRUCK_LNG,
      parseFloat(geoData[0].lat),
      parseFloat(geoData[0].lon),
    );
    // Round up to whole miles for billing
    const billableMiles = Math.max(Math.ceil(miles), 1);
    const quote: DeliveryQuote = {
      miles: Math.round(miles * 10) / 10,
      billableMiles,
      feeCents: billableMiles * CENTS_PER_MILE,
    };
    if (quoteCache.size >= CACHE_MAX_ENTRIES) quoteCache.clear();
    quoteCache.set(key, { quote, expiresAt: Date.now() + CACHE_TTL_MS });
    return quote;
  } catch {
    return null;
  }
}
