import { geocodePoint } from "./geocode";
import { STORE_LOCATION, milesBetween } from "./tracking";

// Food truck location: 2600 W Victory Blvd, Burbank, CA 91505
const TRUCK_LAT = STORE_LOCATION.latitude;
const TRUCK_LNG = STORE_LOCATION.longitude;
const CENTS_PER_MILE = 300;
// A geocode can resolve outside normal delivery range (wrong zip, another
// state). Cap the distance so the quoted fee stays sane; drivers decline
// anything outside their actual range.
const MAX_BILLABLE_MILES = 20;

export type DeliveryQuote = {
  miles: number;
  billableMiles: number;
  feeCents: number;
};

export async function computeDeliveryFeeCents(
  address: string,
): Promise<DeliveryQuote | null> {
  const point = await geocodePoint(address);
  if (!point) return null;

  const miles = milesBetween(
    { latitude: TRUCK_LAT, longitude: TRUCK_LNG },
    point,
  );
  // Round up to whole miles for billing, capped at MAX_BILLABLE_MILES.
  const billableMiles = Math.min(Math.max(Math.ceil(miles), 1), MAX_BILLABLE_MILES);
  return {
    miles: Math.round(miles * 10) / 10,
    billableMiles,
    feeCents: billableMiles * CENTS_PER_MILE,
  };
}
