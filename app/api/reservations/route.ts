import { getDb } from "../../../db";
import { ensureBootstrap } from "../../../db/bootstrap";
import { reservations } from "../../../db/schema";
import { toErrorResponse } from "../../../lib/admin-routes";

const NAME_RE = /^[a-zA-Z0-9 .,'’-]{1,60}$/;
const PHONE_DIGITS = /^\d{7,15}$/;

const EVENT_TYPES = [
  "Birthday party",
  "Corporate event",
  "Private party",
  "Catering order",
  "Other",
] as const;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      name?: string;
      email?: string;
      phone?: string;
      eventType?: string;
      guestCount?: number;
      dateTime?: string;
      message?: string;
    };

    const name = payload.name?.trim() ?? "";
    const email = (payload.email?.trim() ?? "").toLowerCase();
    const phone = (payload.phone?.trim() ?? "").replace(/\D/g, "");
    const eventType = payload.eventType?.trim() ?? "";
    const guestCount = Math.round(Number(payload.guestCount));
    const dateTime = payload.dateTime ? new Date(payload.dateTime) : null;
    const message = (payload.message?.trim() ?? "").slice(0, 500);

    if (!NAME_RE.test(name)) {
      return Response.json({ error: "Enter your name (letters, numbers, and basic punctuation)." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!PHONE_DIGITS.test(phone)) {
      return Response.json({ error: "Enter a valid phone number." }, { status: 400 });
    }
    if (!EVENT_TYPES.includes(eventType as (typeof EVENT_TYPES)[number])) {
      return Response.json({ error: "Choose the type of event." }, { status: 400 });
    }
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 500) {
      return Response.json({ error: "Expected guests must be between 1 and 500." }, { status: 400 });
    }
    if (!dateTime || Number.isNaN(dateTime.getTime())) {
      return Response.json({ error: "Choose a date and time for your event." }, { status: 400 });
    }
    if (dateTime.getTime() < Date.now() - 60_000) {
      return Response.json({ error: "Pick a date and time in the future." }, { status: 400 });
    }

    const db = getDb();
    await ensureBootstrap(db);

    const [reservation] = await db
      .insert(reservations)
      .values({
        name,
        phone,
        email,
        eventType,
        partySize: guestCount,
        dateTime,
        notes: message,
        status: "pending",
        createdAt: new Date(),
      })
      .returning();

    return Response.json(
      {
        reservation: {
          id: reservation.id,
          name: reservation.name,
          eventType: reservation.eventType,
          partySize: reservation.partySize,
          dateTime: reservation.dateTime,
          status: reservation.status,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}