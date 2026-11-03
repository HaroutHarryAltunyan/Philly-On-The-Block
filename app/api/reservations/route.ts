import { getDb } from "../../../db";
import { ensureBootstrap } from "../../../db/bootstrap";
import { reservations } from "../../../db/schema";
import { toErrorResponse } from "../../../lib/admin-routes";
import { checkRateLimit, clientIp, rateLimitResponse } from "../../../lib/rate-limit";
import { isCrossOrigin, crossOriginResponse } from "../../../lib/csrf";
import { pushToStaff } from "../../../lib/push";

const RESERVATION_MAX_PER_WINDOW = 5;
const RESERVATION_WINDOW_MS = 60 * 60 * 1000;

const NAME_RE = /^[a-zA-Z0-9 .,'’-]{1,60}$/;
const PHONE_DIGITS = /^\d{7,15}$/;

// Keep in sync with EVENT_TYPE_OPTIONS on the /events page.
const EVENT_TYPES = [
  "Private party",
  "Office lunch",
  "Birthday party",
  "Film production",
  "Studio set",
  "Corporate event",
  "Catering order",
  "Other",
] as const;

export async function POST(request: Request) {
  try {
    if (isCrossOrigin(request)) return crossOriginResponse();

    const payload = (await request.json()) as {
      name?: string;
      email?: string;
      phone?: string;
      eventType?: string;
      guestCount?: number;
      dateTime?: string;
      location?: string;
      message?: string;
      // Honeypot: hidden from people, filled in by form-stuffing bots.
      website?: string;
    };

    if (typeof payload.website === "string" && payload.website.trim() !== "") {
      // Pretend success so the bot doesn't retry with a different payload.
      return Response.json({ reservation: { id: 0, name: "", eventType: "", partySize: 0, dateTime: new Date().toISOString(), status: "pending" } }, { status: 201 });
    }

    const name = payload.name?.trim() ?? "";
    const email = (payload.email?.trim() ?? "").toLowerCase();
    const phone = (payload.phone?.trim() ?? "").replace(/\D/g, "");
    const eventType = payload.eventType?.trim() ?? "";
    const guestCount = Math.round(Number(payload.guestCount));
    const dateTime = payload.dateTime ? new Date(payload.dateTime) : null;
    const message = (payload.message?.trim() ?? "").slice(0, 500);
    const location = (payload.location?.trim() ?? "").slice(0, 200);

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

    const limited = await checkRateLimit(db, `reservation:${clientIp(request)}`, RESERVATION_MAX_PER_WINDOW, RESERVATION_WINDOW_MS);
    if (!limited.allowed) {
      return rateLimitResponse(limited) ?? Response.json({ error: "Too many requests" }, { status: 429 });
    }

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
        location,
        status: "pending",
        createdAt: new Date(),
      })
      .returning();

    // Let staff know right away (best-effort; never fails the request).
    await pushToStaff(db, {
      title: "New event request",
      body: `${eventType} · ${guestCount} guests · ${name}`,
      data: { kind: "reservation", id: reservation.id },
    }).catch(() => undefined);

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