import { computeDeliveryFeeCents } from "../../../lib/delivery-fee";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
    };
    const addressLine1 = String(body.address ?? "").trim();
    const city = String(body.city ?? "").trim();
    const state = String(body.state ?? "").trim();
    const zip = String(body.zip ?? "").trim();

    if (!addressLine1) {
      return Response.json({ error: "Address required" }, { status: 400 });
    }

    // Build full query for geocoding
    const parts = [addressLine1];
    if (city) parts.push(city);
    if (state) parts.push(state);
    if (zip) parts.push(zip);
    const query = parts.join(", ");

    const quote = await computeDeliveryFeeCents(query);
    if (!quote) {
      return Response.json({ error: "Could not locate address" }, { status: 400 });
    }

    return Response.json({
      miles: quote.miles,
      billableMiles: quote.billableMiles,
      feeCents: quote.feeCents,
    });
  } catch {
    return Response.json({ error: "Failed to calculate delivery fee" }, { status: 500 });
  }
}
