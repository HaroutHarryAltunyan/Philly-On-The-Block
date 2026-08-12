import { getDb } from "../../../db";
import { ensureBootstrap } from "../../../db/bootstrap";
import { getSetting } from "../../../lib/admin-auth";
import { loadOrderFees } from "../../../lib/checkout";
import { toErrorResponse } from "../../../lib/admin-routes";

export async function GET() {
  try {
    const db = getDb();
    await ensureBootstrap(db);

    const [raw, fees] = await Promise.all([
      getSetting(db, "weeklyHours"),
      loadOrderFees(db),
    ]);
    return Response.json({
      weeklyHours: raw ? (JSON.parse(raw) as unknown) : null,
      fees,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}