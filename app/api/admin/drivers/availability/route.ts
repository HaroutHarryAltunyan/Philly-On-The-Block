import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { drivers } from "@/db/schema";
import { getActiveDriverFromRequest } from "@/lib/driver-auth";
import { toErrorResponse } from "@/lib/admin-routes";

// Driver goes online (available for deliveries) or offline. Staff see this
// in the driver list so they know who to assign.
export async function POST(request: Request) {
  try {
    const db = getDb();
    await ensureBootstrap(db);
    const driver = await getActiveDriverFromRequest(request, db);
    if (!driver) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const payload = (await request.json().catch(() => null)) as { online?: unknown } | null;
    if (typeof payload?.online !== "boolean") {
      return Response.json({ error: "online must be true or false" }, { status: 400 });
    }
    const [updated] = await db
      .update(drivers)
      .set({ online: payload.online, onlineAt: new Date() })
      .where(eq(drivers.id, driver.id))
      .returning();
    return Response.json({ online: updated.online, onlineAt: updated.onlineAt });
  } catch (error) {
    return toErrorResponse(error);
  }
}
