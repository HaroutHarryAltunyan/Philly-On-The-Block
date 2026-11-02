import { asc } from "drizzle-orm";
import { staffRoles, staffUsers } from "@/db/schema";
import { OWNER_ONLY, requireStaff, toErrorResponse } from "@/lib/admin-routes";
import { hashDriverPassword } from "@/lib/driver-auth";
import { audit } from "@/lib/audit";
import { publicStaff } from "@/lib/staff";

// Owner-only: list and create per-person staff accounts.
export async function GET(request: Request) {
  try {
    const { db } = await requireStaff(request, OWNER_ONLY);
    const rows = await db.select().from(staffUsers).orderBy(asc(staffUsers.name));
    return Response.json({ staff: rows.map(publicStaff) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { db, actor } = await requireStaff(request, OWNER_ONLY);
    const payload = (await request.json()) as { name?: string; username?: string; password?: string; role?: string };
    const name = payload.name?.trim() ?? "";
    const username = payload.username?.trim().toLowerCase() ?? "";
    const password = payload.password ?? "";
    const role = payload.role ?? "kitchen";
    if (!name || !/^[a-z0-9._-]{3,32}$/.test(username)) {
      return Response.json({ error: "Name and a 3–32 character username (letters, numbers, . _ -) are required" }, { status: 400 });
    }
    if (password.length < 10) {
      return Response.json({ error: "Password must be at least 10 characters" }, { status: 400 });
    }
    if (!staffRoles.includes(role as (typeof staffRoles)[number])) {
      return Response.json({ error: `role must be one of: ${staffRoles.join(", ")}` }, { status: 400 });
    }
    try {
      const [row] = await db
        .insert(staffUsers)
        .values({
          name,
          username,
          passwordHash: await hashDriverPassword(password),
          role: role as (typeof staffRoles)[number],
          createdAt: new Date(),
        })
        .returning();
      await audit(db, request, actor, "staff.create", row.id, { username, role });
      return Response.json({ staff: publicStaff(row) }, { status: 201 });
    } catch (error) {
      if (String((error as Error)?.message ?? "").includes("UNIQUE") || String((error as { cause?: Error })?.cause?.message ?? "").includes("UNIQUE")) {
        return Response.json({ error: "That username is taken" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
