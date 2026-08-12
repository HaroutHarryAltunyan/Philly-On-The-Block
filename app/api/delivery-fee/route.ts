import { computeDeliveryFeeCents } from "../../../lib/delivery-fee";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
    };
    const city = String(body.city ?? "").trim();
    const state = String(body.state ?? "").trim();
    const zip = String(body.zip ?? "").trim();
    // Build full query for geocoding. The client sends the full address
    // string, but parts are accepted as a fallback for older callers.
    const parts = [String(body.address ?? "").trim()];
    if (parts[0].length === 0) {
      if (city) parts.push(city);
      if (state) parts.push(state);
      if (zip) parts.push(zip);
    }
    const query = parts.filter(Boolean).join(", ");
    if (!query) {
      return Response.json({ error: "Address required" }, { status: 400 });
    }

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
