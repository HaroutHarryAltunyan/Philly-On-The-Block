import { desc } from "drizzle-orm";
import { reservations } from "../../../../db/schema";
import { AuthError, requireAdmin, toErrorResponse } from "../../../../lib/admin-routes";

export async function GET(request: Request) {
  try {
    const db = await requireAdmin(request);
    const rows = await db
      .select()
      .from(reservations)
      .orderBy(desc(reservations.dateTime), desc(reservations.id))
      .limit(100);

    return Response.json({ reservations: rows });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = await requireAdmin(request);
    const payload = (await request.json()) as {
      name?: string;
      email?: string;
      phone?: string;
      eventType?: string;
      partySize?: number;
      dateTime?: string | number;
      notes?: string;
    };

    const name = payload.name?.trim() ?? "";
    const phone = payload.phone?.trim() ?? "";
    const partySize = payload.partySize;
    const dateTime = payload.dateTime;

    if (!name || !phone || typeof partySize !== "number" || partySize < 1 || !dateTime) {
      return Response.json(
        { error: "name, phone, partySize (>= 1), and dateTime are required" },
        { status: 400 },
      );
    }

    const parsed = new Date(dateTime);
    if (Number.isNaN(parsed.getTime())) {
      return Response.json({ error: "dateTime must be a valid date" }, { status: 400 });
    }

    const [reservation] = await db
      .insert(reservations)
      .values({
        name,
        phone,
        email: (payload.email?.trim() ?? "").slice(0, 120),
        eventType: (payload.eventType?.trim() ?? "").slice(0, 40),
        partySize,
        dateTime: parsed,
        notes: payload.notes?.trim() ?? "",
        status: "pending",
        createdAt: new Date(),
      })
      .returning();

    return Response.json({ reservation }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}
