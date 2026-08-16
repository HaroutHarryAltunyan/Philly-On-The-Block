import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureBootstrap } from "../../../db/bootstrap";
import { subscribers } from "../../../db/schema";
import { toErrorResponse } from "../../../lib/admin-routes";
import { checkRateLimit, clientIp, rateLimitResponse } from "../../../lib/rate-limit";

const SUBSCRIBE_MAX_PER_WINDOW = 10;
const SUBSCRIBE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { email?: string };
    const email = (payload.email?.trim() ?? "").toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (email.length > 320) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const db = getDb();
    await ensureBootstrap(db);

    const limited = await checkRateLimit(db, `subscribe:${clientIp(request)}`, SUBSCRIBE_MAX_PER_WINDOW, SUBSCRIBE_WINDOW_MS);
    if (!limited.allowed) {
      return rateLimitResponse(limited) ?? Response.json({ error: "Too many requests" }, { status: 429 });
    }

    const existing = await db
      .select()
      .from(subscribers)
      .where(sql`${subscribers.email} = ${email}`);
    if (existing.length === 0) {
      await db.insert(subscribers).values({ email, createdAt: new Date() });
    }

    return Response.json({ subscribed: true }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
