import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { drivers } from "@/db/schema";
import { createDriverSessionToken, driverSessionCookieHeader, verifyDriverPassword } from "@/lib/driver-auth";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { phone?: string; password?: string };
    const phone = (payload.phone ?? "").trim();
    const password = (payload.password ?? "").trim();

    if (!phone || !password) {
      return Response.json({ error: "Phone and password required" }, { status: 400 });
    }

    const db = getDb();
    await ensureBootstrap(db);

    const [row] = await db.select().from(drivers).where(eq(drivers.phone, phone)).limit(1);
    if (!row) {
      return Response.json({ error: "Driver not found" }, { status: 404 });
    }

    if (row.status !== "active") {
      return Response.json({ error: "Driver account is inactive" }, { status: 403 });
    }

    if (!(await verifyDriverPassword(password, row.passwordHash))) {
      return Response.json({ error: "Wrong password" }, { status: 401 });
    }

    const token = await createDriverSessionToken(db, row.id);
    return Response.json(
      { authenticated: true, driver: { id: row.id, name: row.name, phone: row.phone } },
      {
        status: 200,
        headers: { "Set-Cookie": driverSessionCookieHeader(token) },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Login failed" },
      { status: 500 },
    );
  }
}
