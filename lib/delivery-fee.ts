// Food truck location: 2600 W Victory Blvd, Burbank, CA 91505
const TRUCK_LAT = 34.1808;
const TRUCK_LNG = -118.3198;
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

export async function computeDeliveryFeeCents(
  address: string,
): Promise<DeliveryQuote | null> {
  if (!address.trim()) return null;

  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { "Accept-Language": "en" } },
    );
    if (!geoRes.ok) return null;

    const geoData = (await geoRes.json()) as Array<{ lat?: string; lon?: string }>;
    if (!geoData.length || !geoData[0].lat || !geoData[0].lon) return null;

    const miles = haversine(
      TRUCK_LAT,
      TRUCK_LNG,
      parseFloat(geoData[0].lat),
      parseFloat(geoData[0].lon),
    );
    // Round up to whole miles for billing
    const billableMiles = Math.max(Math.ceil(miles), 1);
    return {
      miles: Math.round(miles * 10) / 10,
      billableMiles,
      feeCents: billableMiles * CENTS_PER_MILE,
    };
  } catch {
    return null;
  }
}
