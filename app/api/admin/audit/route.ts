import { MANAGERS, requireStaff, toErrorResponse } from "@/lib/admin-routes";
import { recentAudit } from "@/lib/audit";

export async function GET(request: Request) {
  try {
    const { db } = await requireStaff(request, MANAGERS);
    const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")) || 200, 1), 500);
    const rows = await recentAudit(db, limit);
    return Response.json({
      entries: rows.map((row) => ({ ...row, detail: row.detail ? (JSON.parse(row.detail) as unknown) : null })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
