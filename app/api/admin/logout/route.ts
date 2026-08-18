import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { clearSessionCookieHeader, requestIsSecure, rotateAdminSessionSecret } from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  // Rotate the admin session secret so the token this request used (and any
  // other live admin tokens) stops being valid immediately, not just when the
  // browser drops the cookie. Best-effort: even if this fails the cookie is
  // still cleared below.
  try {
    const db = getDb();
    await ensureBootstrap(db);
    await rotateAdminSessionSecret(db);
  } catch (error) {
    console.error("Failed to rotate admin session secret on logout:", error);
  }

  return Response.json(
    { authenticated: false },
    { headers: { "Set-Cookie": clearSessionCookieHeader(requestIsSecure(request)) } },
  );
}
