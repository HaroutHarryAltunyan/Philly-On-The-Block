export type GeoPoint = { latitude: number; longitude: number };

// Nominatim hard-limits to ~1 request/second per client, and all requests
// egress from the same worker IPs. Cache successful lookups in memory and
// retry 429s with exponential backoff so bursts (delivery-fee quotes while a
// customer types, checkout geocoding) don't fail or get the worker IPs banned.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 250;
const geoCache = new Map<string, { point: GeoPoint; expiresAt: number }>();

async function fetchNominatim(query: string, retryCount = 0): Promise<Response> {
  const maxRetries = 3;
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "PhillyOnTheBlock/0.1 (restaurant geocoding)",
      },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (response.status === 429 && retryCount < maxRetries) {
    const delay = Math.min(1000 * 2 ** retryCount, 5000);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return fetchNominatim(query, retryCount + 1);
  }
  return response;
}

export async function geocodePoint(query: string): Promise<GeoPoint | null> {
  const key = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;

  const cached = geoCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.point;

  try {
    const response = await fetchNominatim(key);
    if (!response.ok) return null;

    const results = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const first = results[0];
    if (!first || !first.lat || !first.lon) return null;

    const point: GeoPoint = { latitude: parseFloat(first.lat), longitude: parseFloat(first.lon) };
    if (geoCache.size >= CACHE_MAX_ENTRIES) geoCache.clear();
    geoCache.set(key, { point, expiresAt: Date.now() + CACHE_TTL_MS });
    return point;
  } catch {
    return null;
  }
}
