import { desc } from "drizzle-orm";
import { broadcasts } from "../../../../../db/schema";
import { AuthError, toErrorResponse, requireStaff, MANAGERS, ForbiddenError } from "../../../../../lib/admin-routes";

export async function GET(request: Request) {
  try {
    const { db } = await requireStaff(request, MANAGERS);
    const rows = await db
      .select()
      .from(broadcasts)
      .orderBy(desc(broadcasts.createdAt), desc(broadcasts.id))
      .limit(25);

    return Response.json({ broadcasts: rows });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    return toErrorResponse(error);
  }
}
