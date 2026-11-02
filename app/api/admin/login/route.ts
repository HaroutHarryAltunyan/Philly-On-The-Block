import { sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { staffUsers } from "../../../../db/schema";
import {
  createSessionToken,
  getSetting,
  OWNER_PASSCODE_IDENTITY,
  passcodeIsDefault,
  requestIsLocal,
  requestIsSecure,
  sessionCookieHeader,
  SESSION_TTL_MS,
  verifyPasscode,
  wantsNativeToken,
  type StaffIdentity,
} from "../../../../lib/admin-auth";
import { verifyDriverPassword } from "../../../../lib/driver-auth";
import { verifyTotp } from "../../../../lib/totp";
import { audit } from "../../../../lib/audit";
import { checkRateLimit, clearRateLimit, clientIp, rateLimitResponse } from "../../../../lib/rate-limit";
import { isCrossOrigin, crossOriginResponse } from "../../../../lib/csrf";

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
// Same dummy-hash trick as driver login: unknown usernames still pay a full
// PBKDF2 verify so response timing doesn't reveal which accounts exist.
const TIMING_HASH = "pbkdf2$100000$0000000000000000$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

// Two ways in:
//   { passcode, code? }            shared owner passcode (legacy, still works)
//   { username, password, code? }  per-person staff account
// `code` is the 6-digit authenticator code, required when two-factor is on.
export async function POST(request: Request) {
  try {
    if (isCrossOrigin(request)) return crossOriginResponse();

    const payload = (await request.json()) as { passcode?: string; username?: string; password?: string; code?: string };
    const passcode = payload.passcode?.trim() ?? "";
    const username = payload.username?.trim().toLowerCase() ?? "";
    const password = payload.password ?? "";
    const code = payload.code?.trim() ?? "";

    if (!passcode && !(username && password)) {
      return Response.json({ error: "Passcode, or username and password, required" }, { status: 400 });
    }

    const db = getDb();
    await ensureBootstrap(db);

    const key = `admin-login:${clientIp(request)}`;
    const limited = await checkRateLimit(db, key, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
    if (!limited.allowed) {
      return rateLimitResponse(limited) ?? Response.json({ error: "Too many attempts" }, { status: 429 });
    }

    let identity: StaffIdentity;
    let totpSecret = "";

    if (username) {
      const [row] = await db.select().from(staffUsers).where(sql`${staffUsers.username} = ${username}`).limit(1);
      const ok = row ? await verifyDriverPassword(password, row.passwordHash) : await verifyDriverPassword(password, TIMING_HASH);
      if (!row || !ok || !row.active) {
        await audit(db, request, { name: username, role: "unknown" }, "login.failed");
        return Response.json({ error: "Wrong username or password" }, { status: 401 });
      }
      identity = { sid: row.id, role: row.role, name: row.name };
      totpSecret = row.totpSecret;
    } else {
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
        await audit(db, request, { name: "passcode", role: "unknown" }, "login.failed");
        return Response.json({ error: "Wrong passcode" }, { status: 401 });
      }
      identity = OWNER_PASSCODE_IDENTITY;
      totpSecret = (await getSetting(db, "ownerTotpSecret")) ?? "";
    }

    if (totpSecret) {
      if (!code) {
        return Response.json({ error: "Enter the 6-digit code from your authenticator app", code: "mfa_required" }, { status: 401 });
      }
      if (!(await verifyTotp(totpSecret, code))) {
        await audit(db, request, identity, "login.mfa_failed");
        return Response.json({ error: "That code didn't match. Try the newest one.", code: "mfa_invalid" }, { status: 401 });
      }
    }

    await clearRateLimit(db, key);
    const token = await createSessionToken(db, identity);
    await audit(db, request, identity, "login", "", { native: wantsNativeToken(request), mfa: Boolean(totpSecret) });
    return Response.json(
      {
        authenticated: true,
        passcodeIsDefault: identity.sid === 0 ? await passcodeIsDefault(db) : false,
        staff: identity,
        ...(wantsNativeToken(request) ? { token, expiresAt: Date.now() + SESSION_TTL_MS } : {}),
      },
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
