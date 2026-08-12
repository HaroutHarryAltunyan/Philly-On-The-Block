import { asc } from "drizzle-orm";
import { ensureBootstrap } from "@/db/bootstrap";
import { drivers } from "@/db/schema";
import { hashDriverPassword } from "@/lib/driver-auth";
import { AuthError, requireAdmin, toErrorResponse } from "@/lib/admin-routes";

export async function GET(request: Request) {
  try {
    const db = await requireAdmin(request);
    const all = await db.select().from(drivers).orderBy(asc(drivers.name));
    return Response.json({
      drivers: all.map((driver) => ({
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        status: driver.status,
        createdAt: driver.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = await requireAdmin(request);
    const payload = (await request.json()) as { name?: string; phone?: string; password?: string };
    const name = (payload.name ?? "").trim();
    const phone = (payload.phone ?? "").trim();
    const password = (payload.password ?? "").trim();

    if (!name || !phone || !password) {
      return Response.json({ error: "Name, phone, and password required" }, { status: 400 });
    }

    await ensureBootstrap(db);

    const passwordHash = await hashDriverPassword(password);
    const [created] = await db.insert(drivers).values({
      name,
      phone,
      passwordHash,
      status: "active",
      createdAt: new Date(),
    }).returning();

    return Response.json({
      driver: {
        id: created.id,
        name: created.name,
        phone: created.phone,
        status: created.status,
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    const detail =
      error instanceof Error ? [error.message, (error.cause as Error | undefined)?.message].filter(Boolean).join(" ") : "";
    if (detail.includes("UNIQUE constraint failed")) {
      return Response.json({ error: "A driver with that phone already exists" }, { status: 409 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create driver" },
      { status: 500 },
    );
  }
}
