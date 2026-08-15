import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { drivers } from "@/db/schema";
import { createDriverSessionToken, driverSessionCookieHeader, verifyDriverPassword } from "@/lib/driver-auth";
import { requestIsSecure } from "@/lib/admin-auth";
import { checkRateLimit, clearRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { phone?: string; password?: string };
    const phone = (payload.phone ?? "").trim();
    const password = (payload.password ?? "").trim();

    if (!phone || !password) {
      return Response.json({ error: "Phone and password required" }, { status: 400 });
    }

    const db = getDb();
    await ensureBootstrap(db);

    const key = `driver-login:${clientIp(request)}`;
    const limited = await checkRateLimit(db, key, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
    if (!limited.allowed) {
      return rateLimitResponse(limited) ?? Response.json({ error: "Too many attempts" }, { status: 429 });
    }

    const [row] = await db.select().from(drivers).where(eq(drivers.phone, phone)).limit(1);
    if (!row) {
      return Response.json({ error: "Driver not found" }, { status: 404 });
    }

    if (row.status !== "active") {
      return Response.json({ error: "Driver account is inactive" }, { status: 403 });
    }

    if (!(await verifyDriverPassword(password, row.passwordHash))) {
      return Response.json({ error: "Wrong password" }, { status: 401 });
    }

    await clearRateLimit(db, key);
    const token = await createDriverSessionToken(db, row.id);
    return Response.json(
      { authenticated: true, driver: { id: row.id, name: row.name, phone: row.phone } },
      {
        status: 200,
        headers: { "Set-Cookie": driverSessionCookieHeader(token, requestIsSecure(request)) },
      },
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}
