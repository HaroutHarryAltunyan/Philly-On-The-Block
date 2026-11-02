import { desc } from "drizzle-orm";
import type { Db } from "../db/bootstrap";
import { auditLogs } from "../db/schema";
import { clientIp } from "./rate-limit";

export type AuditActor = { name: string; role: string };

/**
 * Records a sensitive action. Never throws: an audit write failure must not
 * break the action itself, but it is logged loudly.
 */
export async function audit(
  db: Db,
  request: Request | null,
  actor: AuditActor,
  action: string,
  target: string | number = "",
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actor: actor.name.slice(0, 120),
      actorRole: actor.role,
      action,
      target: String(target).slice(0, 120),
      detail: Object.keys(detail).length ? JSON.stringify(detail).slice(0, 2000) : "",
      ip: request ? clientIp(request) : "",
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("AUDIT WRITE FAILED", action, target, error);
  }
}

export async function recentAudit(db: Db, limit = 200) {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(limit);
}

export function driverActor(driver: { id: number; name: string }): AuditActor {
  return { name: `${driver.name} (driver #${driver.id})`, role: "driver" };
}
