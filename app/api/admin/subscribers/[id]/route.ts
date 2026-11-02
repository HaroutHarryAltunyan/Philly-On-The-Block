import { audit } from "@/lib/audit";
import { eq } from "drizzle-orm";
import { subscribers } from "../../../../../db/schema";
import { AuthError, toErrorResponse, requireStaff, MANAGERS, ForbiddenError } from "../../../../../lib/admin-routes";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, actor } = await requireStaff(request, MANAGERS);
    const { id } = await context.params;
    const subscriberId = Number(id);
    if (!Number.isInteger(subscriberId) || subscriberId <= 0) {
      return Response.json({ error: "Invalid subscriber id" }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.id, subscriberId))
      .limit(1);
    if (existing.length === 0) {
      return Response.json({ error: "Subscriber not found" }, { status: 404 });
    }

    await db.delete(subscribers).where(eq(subscribers.id, subscriberId));
    await audit(db, request, actor, "subscriber.delete", subscriberId);
    return Response.json({ deleted: subscriberId });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    return toErrorResponse(error);
  }
}
