import { eq } from "drizzle-orm";
import { orders } from "@/db/schema";
import { AuthError, requireAdmin, toErrorResponse } from "@/lib/admin-routes";

export async function POST(request: Request) {
  try {
    const db = await requireAdmin(request);
    const payload = (await request.json()) as { orderId: number; driverId: number };
    const { orderId, driverId } = payload;

    if (!orderId || !driverId) {
      return Response.json({ error: "orderId and driverId required" }, { status: 400 });
    }

    const [updated] = await db
      .update(orders)
      .set({ driverId, status: "delivering" })
      .where(eq(orders.id, orderId))
      .returning();

    if (!updated) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    return Response.json({ order: updated });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}
