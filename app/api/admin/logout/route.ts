import { audit } from "../../../../lib/audit";
import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import {
  clearSessionCookieHeader,
  readBearerToken,
  requestIsSecure,
  revokeSessionToken,
  rotateAdminSessionSecret,
  wantsNativeToken,
  readSessionCredential,
  readStaffSession,
  SESSION_COOKIE,
} from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  try {
    const db = getDb();
    await ensureBootstrap(db);

    // Native apps sign out just this device: revoke the presented token.
    const bearer = readBearerToken(request);
    const who = await readStaffSession(db, readSessionCredential(request, SESSION_COOKIE));
    if (who) await audit(db, request, who, "logout", "", { scope: wantsNativeToken(request) && bearer ? "device" : "all" });
    if (wantsNativeToken(request) && bearer && (await revokeSessionToken(db, bearer))) {
      return Response.json({ authenticated: false, scope: "device" });
    }

    // Web dashboard: rotate the admin session secret so the token this
    // request used (and any other live admin tokens) stops being valid
    // immediately, not just when the browser drops the cookie.
    await rotateAdminSessionSecret(db);
  } catch (error) {
    // Best-effort: even if this fails the cookie is still cleared below.
    console.error("Failed to revoke admin session on logout:", error);
  }

  return Response.json(
    { authenticated: false, scope: "all" },
    { headers: { "Set-Cookie": clearSessionCookieHeader(requestIsSecure(request)) } },
  );
}
