import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import {
  createSessionToken,
  passcodeIsDefault,
  requestIsSecure,
  sessionCookieHeader,
  SESSION_TTL_MS,
  verifyPasscode,
} from "../../../../lib/admin-auth";
import { checkRateLimit, clearRateLimit, clientIp, rateLimitResponse } from "../../../../lib/rate-limit";

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { passcode?: string };
    const passcode = payload.passcode?.trim() ?? "";

    if (!passcode) {
      return Response.json({ error: "Passcode required" }, { status: 400 });
    }

    const db = getDb();
    await ensureBootstrap(db);

    const key = `admin-login:${clientIp(request)}`;
    const limited = await checkRateLimit(db, key, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
    if (!limited.allowed) {
      return rateLimitResponse(limited) ?? Response.json({ error: "Too many attempts" }, { status: 429 });
    }

    if (!(await verifyPasscode(db, passcode))) {
      return Response.json({ error: "Wrong passcode" }, { status: 401 });
    }

    await clearRateLimit(db, key);
    const token = await createSessionToken(db);
    return Response.json(
      { authenticated: true, passcodeIsDefault: await passcodeIsDefault(db) },
      {
        status: 200,
        headers: { "Set-Cookie": sessionCookieHeader(token, SESSION_TTL_MS, requestIsSecure(request)) },
      },
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}
