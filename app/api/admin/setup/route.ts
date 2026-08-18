import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { settings } from "../../../../db/schema";
import {
  constantTimeEqual,
  getSetting,
  hashPasscode,
  rotateAdminSessionSecret,
  setSetting,
} from "../../../../lib/admin-auth";
import { checkRateLimit, clientIp, rateLimitResponse } from "../../../../lib/rate-limit";
import { isCrossOrigin, crossOriginResponse } from "../../../../lib/csrf";
import { toErrorResponse } from "../../../../lib/admin-routes";

const SETUP_MAX_PER_WINDOW = 5;
const SETUP_WINDOW_MS = 10 * 60 * 1000;

// One-time passcode setup for production first-run (and recovery). The
// default passcode is public, so it never works outside localhost; instead
// the operator stores a random one-time token in D1 (see README) and calls
// this endpoint to set the real passcode. The token is consumed on success.
export async function POST(request: Request) {
  try {
    if (isCrossOrigin(request)) return crossOriginResponse();

    const payload = (await request.json()) as { setupToken?: string; passcode?: string };
    const setupToken = (payload.setupToken ?? "").trim();
    const passcode = payload.passcode;

    if (!setupToken || typeof passcode !== "string" || passcode.length < 8) {
      return Response.json(
        { error: "A setup token and a passcode of at least 8 characters are required." },
        { status: 400 },
      );
    }

    const db = getDb();
    await ensureBootstrap(db);

    const limited = await checkRateLimit(db, `admin-setup:${clientIp(request)}`, SETUP_MAX_PER_WINDOW, SETUP_WINDOW_MS);
    if (!limited.allowed) {
      return rateLimitResponse(limited) ?? Response.json({ error: "Too many attempts" }, { status: 429 });
    }

    const storedToken = await getSetting(db, "setupToken");
    if (!storedToken || !constantTimeEqual(storedToken, setupToken)) {
      return Response.json({ error: "Invalid or expired setup token." }, { status: 403 });
    }

    await setSetting(db, "adminPasscodeHash", await hashPasscode(passcode));
    await db.delete(settings).where(eq(settings.key, "setupToken"));
    // New passcode, new token space: any session issued while the default
    // passcode was in play (e.g. on a recovery box) is dropped.
    await rotateAdminSessionSecret(db);

    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
