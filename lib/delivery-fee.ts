import { geocodePoint } from "./geocode";
import { STORE_LOCATION, milesBetween } from "./tracking";

// Food truck location: 2600 W Victory Blvd, Burbank, CA 91505
const TRUCK_LAT = STORE_LOCATION.latitude;
const TRUCK_LNG = STORE_LOCATION.longitude;
const CENTS_PER_MILE = 300;

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
  // Round up to whole miles for billing
  const billableMiles = Math.max(Math.ceil(miles), 1);
  return {
    miles: Math.round(miles * 10) / 10,
    billableMiles,
    feeCents: billableMiles * CENTS_PER_MILE,
  };
}
