import { getDb } from "../db";
import { ensureBootstrap, type Db } from "../db/bootstrap";
import { readSessionCredential, readStaffSession, SESSION_COOKIE, type StaffIdentity } from "./admin-auth";

export class AuthError extends Error {}
export class ForbiddenError extends Error {}

export type StaffRole = StaffIdentity["role"];
export const MANAGERS: StaffRole[] = ["owner", "manager"];
export const OWNER_ONLY: StaffRole[] = ["owner"];

/**
 * Authenticates a staff request (cookie or bearer token) and, when `roles` is
 * given, requires one of them. Throws AuthError (401) or ForbiddenError (403).
 */
export async function requireStaff(
  request: Request,
  roles?: StaffRole[],
): Promise<{ db: Db; actor: StaffIdentity }> {
  const db = getDb();
  await ensureBootstrap(db);
  const actor = await readStaffSession(db, readSessionCredential(request, SESSION_COOKIE));
  if (!actor) throw new AuthError("Not authenticated");
  if (roles && !roles.includes(actor.role)) {
    throw new ForbiddenError(`This needs a ${roles.join(" or ")} account`);
  }
  return { db, actor };
}

/** Any signed-in staff member (owner, manager or kitchen). */
export async function requireAdmin(request: Request, roles?: StaffRole[]): Promise<Db> {
  return (await requireStaff(request, roles)).db;
}

export function toErrorResponse(error: unknown, fallback = "Unexpected error"): Response {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
  if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
  if (
    error instanceof Error &&
    (error.message.includes("no such table") ||
      error.message.includes("no such column") ||
      error.message.includes('from "') ||
      error.message.includes('insert into "'))
  ) {
    return Response.json(
      {
        error:
          "The database is not ready yet. Run `npm run db:generate` and apply the generated migration to the D1 database, or restart the dev server so it can bootstrap the tables.",
      },
      { status: 500 },
    );
  }

  console.error(error);
  return Response.json({ error: fallback }, { status: 500 });
}
