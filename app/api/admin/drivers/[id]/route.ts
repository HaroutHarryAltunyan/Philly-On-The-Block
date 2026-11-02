import { audit } from "@/lib/audit";
import { eq, sql, type SQL } from "drizzle-orm";
import { drivers } from "@/db/schema";
import { hashDriverPassword } from "@/lib/driver-auth";
import { AuthError, requireStaff, MANAGERS, ForbiddenError } from "@/lib/admin-routes";

const DRIVER_STATUSES = ["active", "inactive"] as const;

function publicDriver(driver: { id: number; name: string; phone: string; status: string; createdAt: Date }) {
  return {
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
    status: driver.status,
    createdAt: driver.createdAt,
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, actor } = await requireStaff(request, MANAGERS);
    const { id } = await params;
    const driverId = Number(id);
    if (!Number.isInteger(driverId) || driverId <= 0) {
      return Response.json({ error: "Invalid driver id" }, { status: 400 });
    }

    const payload = (await request.json()) as { name?: string; phone?: string; password?: string; status?: string };
    const updates: Record<string, string | boolean | SQL> = {};

    if (payload.name !== undefined) {
      const name = payload.name.trim();
      if (!name) {
        return Response.json({ error: "name must not be empty" }, { status: 400 });
      }
      updates.name = name;
    }
    if (payload.phone !== undefined) {
      const phone = payload.phone.trim();
      if (!phone) {
        return Response.json({ error: "phone must not be empty" }, { status: 400 });
      }
      updates.phone = phone;
    }
    if (payload.status !== undefined) {
      if (!DRIVER_STATUSES.includes(payload.status as (typeof DRIVER_STATUSES)[number])) {
        return Response.json(
          { error: `status must be one of: ${DRIVER_STATUSES.join(", ")}` },
          { status: 400 },
        );
      }
      updates.status = payload.status;
    }
    if (payload.password !== undefined) {
      const password = payload.password.trim();
      if (password.length < 6) {
        return Response.json({ error: "password must be at least 6 characters" }, { status: 400 });
      }
      updates.passwordHash = await hashDriverPassword(password);
    }
    // Password change or deactivation signs the driver out everywhere.
    if (updates.passwordHash !== undefined || updates.status === "inactive") {
      updates.sessionVersion = sql`${drivers.sessionVersion} + 1`;
      updates.online = false;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No updates provided" }, { status: 400 });
    }

    const [updated] = await db.update(drivers).set(updates).where(eq(drivers.id, driverId)).returning();

    if (!updated) {
      return Response.json({ error: "Driver not found" }, { status: 404 });
    }

    await audit(db, request, actor, "driver.update", driverId, { fields: Object.keys(payload).filter((k) => k !== "password"), passwordReset: payload.password !== undefined });
    return Response.json({ driver: publicDriver(updated) });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    const detail =
      error instanceof Error ? [error.message, (error.cause as Error | undefined)?.message].filter(Boolean).join(" ") : "";
    if (detail.includes("UNIQUE constraint failed")) {
      return Response.json({ error: "A driver with that phone already exists" }, { status: 409 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update driver" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, actor } = await requireStaff(request, MANAGERS);
    const { id } = await params;
    const driverId = Number(id);
    if (!Number.isInteger(driverId) || driverId <= 0) {
      return Response.json({ error: "Invalid driver id" }, { status: 400 });
    }

    const [deleted] = await db.delete(drivers).where(eq(drivers.id, driverId)).returning();
    if (!deleted) {
      return Response.json({ error: "Driver not found" }, { status: 404 });
    }
    await audit(db, request, actor, "driver.delete", driverId);
    return Response.json({ deleted: driverId });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete driver" },
      { status: 500 },
    );
  }
}
