import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";

export async function GET(request: Request) {
  try {
    const db = getDb();
    await ensureBootstrap(db);

    const driver = await getActiveDriverFromRequest(request, db);
    if (!driver) {
      return Response.json({ authenticated: false });
    }

    return Response.json({
      authenticated: true,
      driver: { id: driver.id, name: driver.name, phone: driver.phone, online: driver.online },
    });
  } catch {
    return Response.json({ authenticated: false });
  }
}
