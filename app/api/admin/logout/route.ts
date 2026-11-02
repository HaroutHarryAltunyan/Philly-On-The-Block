import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import {
  clearSessionCookieHeader,
  readBearerToken,
  requestIsSecure,
  revokeSessionToken,
  rotateAdminSessionSecret,
  wantsNativeToken,
} from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  try {
    const db = getDb();
    await ensureBootstrap(db);

    // Native apps sign out just this device: revoke the presented token.
    const bearer = readBearerToken(request);
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
