import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { getDriver, readDriverSession } from "@/lib/driver-auth";

export async function GET(request: Request) {
  try {
    const db = getDb();
    await ensureBootstrap(db);

    const session = await readDriverSession(request, db);
    if (!session) {
      return Response.json({ authenticated: false });
    }

    const driver = await getDriver(db, session.id);
    if (!driver || driver.status !== "active") {
      return Response.json({ authenticated: false });
    }

    return Response.json({
      authenticated: true,
      driver: { id: driver.id, name: driver.name, phone: driver.phone },
    });
  } catch {
    return Response.json({ authenticated: false });
  }
}
