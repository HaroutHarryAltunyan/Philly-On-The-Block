import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import {
  createSessionToken,
  passcodeIsDefault,
  requestIsLocal,
  requestIsSecure,
  sessionCookieHeader,
  SESSION_TTL_MS,
  verifyPasscode,
} from "../../../../lib/admin-auth";
import { checkRateLimit, clearRateLimit, clientIp, rateLimitResponse } from "../../../../lib/rate-limit";
import { isCrossOrigin, crossOriginResponse } from "../../../../lib/csrf";

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    if (isCrossOrigin(request)) return crossOriginResponse();

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

    // The default passcode is public (documented in the repo), so it must
    // never work outside local development. Production first-run uses the
    // one-time setup token flow (POST /api/admin/setup, see README).
    if (!requestIsLocal(request) && (await passcodeIsDefault(db))) {
      return Response.json(
        { error: "The default passcode is disabled outside local development. Set your own passcode with the one-time setup flow (see README)." },
        { status: 403 },
      );
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
