import { eq } from "drizzle-orm";
import { drivers } from "@/db/schema";
import { hashDriverPassword } from "@/lib/driver-auth";
import { AuthError, requireAdmin } from "@/lib/admin-routes";

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
    const db = await requireAdmin(request);
    const { id } = await params;
    const driverId = Number(id);
    if (!Number.isInteger(driverId) || driverId <= 0) {
      return Response.json({ error: "Invalid driver id" }, { status: 400 });
    }

    const payload = (await request.json()) as { name?: string; phone?: string; password?: string; status?: string };
    const updates: Record<string, string> = {};

    if (payload.name !== undefined) updates.name = payload.name.trim();
    if (payload.phone !== undefined) updates.phone = payload.phone.trim();
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

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No updates provided" }, { status: 400 });
    }

    const [updated] = await db.update(drivers).set(updates).where(eq(drivers.id, driverId)).returning();

    if (!updated) {
      return Response.json({ error: "Driver not found" }, { status: 404 });
    }

    return Response.json({ driver: publicDriver(updated) });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update driver" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await requireAdmin(request);
    const { id } = await params;
    const driverId = Number(id);
    if (!Number.isInteger(driverId) || driverId <= 0) {
      return Response.json({ error: "Invalid driver id" }, { status: 400 });
    }

    const [deleted] = await db.delete(drivers).where(eq(drivers.id, driverId)).returning();
    if (!deleted) {
      return Response.json({ error: "Driver not found" }, { status: 404 });
    }
    return Response.json({ deleted: driverId });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete driver" },
      { status: 500 },
    );
  }
}
