import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { requestIsSecure } from "@/lib/admin-auth";
import { bumpDriverSessionVersion, clearDriverSessionCookieHeader, getActiveDriverFromRequest } from "@/lib/driver-auth";

export async function POST(request: Request) {
  // Revoke server-side: bumping the version kills this token and any other
  // session the driver has open (a lost phone, an old browser tab).
  try {
    const db = getDb();
    await ensureBootstrap(db);
    const driver = await getActiveDriverFromRequest(request, db);
    if (driver) await bumpDriverSessionVersion(db, driver.id);
  } catch (error) {
    console.error("Failed to revoke driver session on logout:", error);
  }
  return Response.json(
    { authenticated: false },
    { headers: { "Set-Cookie": clearDriverSessionCookieHeader(requestIsSecure(request)) } },
  );
}
