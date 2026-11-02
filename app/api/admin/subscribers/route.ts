import { audit } from "@/lib/audit";
import { desc, sql } from "drizzle-orm";
import { subscribers } from "../../../../db/schema";
import { AuthError, toErrorResponse, requireStaff, MANAGERS, ForbiddenError } from "../../../../lib/admin-routes";

export async function GET(request: Request) {
  try {
    const { db } = await requireStaff(request, MANAGERS);
    const rows = await db.select().from(subscribers).orderBy(desc(subscribers.id));

    return Response.json({ subscribers: rows });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { db, actor } = await requireStaff(request, MANAGERS);
    const payload = (await request.json()) as { email?: string };
    const email = (payload.email?.trim() ?? "").toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const existing = await db.select().from(subscribers).where(sql`${subscribers.email} = ${email}`).limit(1);
    if (existing.length > 0) {
      return Response.json({ error: "That email is already subscribed" }, { status: 409 });
    }

    const [subscriber] = await db
      .insert(subscribers)
      .values({ email, createdAt: new Date() })
      .returning();

    await audit(db, request, actor, "subscriber.create", subscriber.id);

    return Response.json({ subscriber }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    return toErrorResponse(error);
  }
}
