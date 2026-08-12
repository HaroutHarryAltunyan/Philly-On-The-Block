import { and, eq } from "drizzle-orm";
import { reservations } from "../../../../../db/schema";
import { AuthError, requireAdmin, toErrorResponse } from "../../../../../lib/admin-routes";

const STATUSES = ["pending", "confirmed", "cancelled"] as const;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await requireAdmin(request);
    const { id } = await context.params;
    const reservationId = Number(id);
    if (!Number.isInteger(reservationId) || reservationId <= 0) {
      return Response.json({ error: "Invalid reservation id" }, { status: 400 });
    }

    const payload = (await request.json()) as { status?: string; partySize?: number; dateTime?: string };
    if (
      payload.status &&
      !STATUSES.includes(payload.status as (typeof STATUSES)[number])
    ) {
      return Response.json(
        { error: `status must be one of: ${STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    if (payload.partySize !== undefined && (typeof payload.partySize !== "number" || payload.partySize < 1)) {
      return Response.json({ error: "partySize must be >= 1" }, { status: 400 });
    }
    if (payload.dateTime !== undefined) {
      const dateTime = new Date(payload.dateTime);
      if (Number.isNaN(dateTime.getTime())) {
        return Response.json({ error: "dateTime must be a valid date" }, { status: 400 });
      }
    }

    const existing = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
    if (existing.length === 0) {
      return Response.json({ error: "Reservation not found" }, { status: 404 });
    }
    const current = existing[0];

    const [reservation] = await db
      .update(reservations)
      .set({
        status: (payload.status ?? current.status) as "pending" | "confirmed" | "cancelled",
        partySize: payload.partySize ?? current.partySize,
        dateTime: payload.dateTime ? new Date(payload.dateTime) : current.dateTime,
      })
      .where(and(eq(reservations.id, reservationId)))
      .returning();

    return Response.json({ reservation });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await requireAdmin(request);
    const { id } = await context.params;
    const reservationId = Number(id);
    if (!Number.isInteger(reservationId) || reservationId <= 0) {
      return Response.json({ error: "Invalid reservation id" }, { status: 400 });
    }

    const existing = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
    if (existing.length === 0) {
      return Response.json({ error: "Reservation not found" }, { status: 404 });
    }

    await db.delete(reservations).where(and(eq(reservations.id, reservationId)));
    return Response.json({ deleted: reservationId });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}
