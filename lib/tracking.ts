import { geocodePoint } from "./geocode";

export const STORE_LOCATION = {
  latitude: 34.1841,
  longitude: -118.3396,
  label: "Philly on the Block — 2600 W Victory Blvd, Burbank",
} as const;

const EARTH_RADIUS_MILES = 3958.8;

export function milesBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const haversine =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(haversine));
}

export function parseCoordinatePair(lat: unknown, lng: unknown): { latitude: number; longitude: number } | null {
  const latText = String(lat ?? "").trim();
  const lngText = String(lng ?? "").trim();
  if (!latText || !lngText) return null;
  const latitude = Number(latText);
  const longitude = Number(lngText);
  if (
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function addressVariants(address: string): string[] {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const variants: string[] = [];
  for (let i = parts.length; i > 0; i--) {
    variants.push(parts.slice(0, i).join(", "));
  }
  const seen = new Set<string>();
  return variants.filter((v) => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}

export async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  for (const variant of addressVariants(address)) {
    const coords = await geocodePoint(variant);
    if (coords) return coords;
  }
  return null;
}