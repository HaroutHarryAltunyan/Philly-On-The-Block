import { eq } from "drizzle-orm";
import { staffRoles, staffUsers } from "@/db/schema";
import { OWNER_ONLY, requireStaff, toErrorResponse } from "@/lib/admin-routes";
import { hashDriverPassword } from "@/lib/driver-auth";
import { audit } from "@/lib/audit";
import { publicStaff } from "@/lib/staff";

// Owner-only: change role, reset password, turn off two-factor, deactivate.
// A deactivated account's tokens stop working on the next request.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, actor } = await requireStaff(request, OWNER_ONLY);
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Invalid staff id" }, { status: 400 });

    const payload = (await request.json()) as { name?: string; role?: string; password?: string; active?: boolean; resetMfa?: boolean };
    const updates: Partial<typeof staffUsers.$inferInsert> = {};
    if (payload.name !== undefined) {
      if (!payload.name.trim()) return Response.json({ error: "name must not be empty" }, { status: 400 });
      updates.name = payload.name.trim();
    }
    if (payload.role !== undefined) {
      if (!staffRoles.includes(payload.role as (typeof staffRoles)[number])) {
        return Response.json({ error: `role must be one of: ${staffRoles.join(", ")}` }, { status: 400 });
      }
      updates.role = payload.role as (typeof staffRoles)[number];
    }
    if (payload.password !== undefined) {
      if (payload.password.length < 10) return Response.json({ error: "Password must be at least 10 characters" }, { status: 400 });
      updates.passwordHash = await hashDriverPassword(payload.password);
    }
    if (payload.active !== undefined) updates.active = Boolean(payload.active);
    if (payload.resetMfa) {
      updates.totpSecret = "";
      updates.totpPending = "";
    }
    if (Object.keys(updates).length === 0) return Response.json({ error: "No updates provided" }, { status: 400 });

    const [row] = await db.update(staffUsers).set(updates).where(eq(staffUsers.id, id)).returning();
    if (!row) return Response.json({ error: "Staff member not found" }, { status: 404 });
    await audit(db, request, actor, "staff.update", id, {
      ...(updates.role ? { role: updates.role } : {}),
      ...(payload.active !== undefined ? { active: payload.active } : {}),
      ...(payload.password !== undefined ? { passwordReset: true } : {}),
      ...(payload.resetMfa ? { mfaReset: true } : {}),
    });
    return Response.json({ staff: publicStaff(row) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
