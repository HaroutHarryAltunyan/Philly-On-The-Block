import { getDb } from "../db";
import { ensureBootstrap, type Db } from "../db/bootstrap";
import { readCookie, readSessionToken, SESSION_COOKIE } from "./admin-auth";

export class AuthError extends Error {}

export async function requireAdmin(request: Request): Promise<Db> {
  const db = getDb();
  await ensureBootstrap(db);

  const token = readCookie(request, SESSION_COOKIE);
  const valid = await readSessionToken(db, token);
  if (!valid) {
    throw new AuthError("Not authenticated");
  }

  return db;
}

export function toErrorResponse(error: unknown, fallback = "Unexpected error"): Response {
  const message = error instanceof Error ? error.message : fallback;
  const detail =
    error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const combined = `${message}\n${detail}`;

  if (
    combined.includes("no such table") ||
    combined.includes("no such column") ||
    combined.includes('from "') ||
    combined.includes('insert into "')
  ) {
    return Response.json(
      {
        error:
          "The database is not ready yet. Run `npm run db:generate` and apply the generated migration to the D1 database, or restart the dev server so it can bootstrap the tables.",
      },
      { status: 500 },
    );
  }

  return Response.json({ error: message || fallback }, { status: 500 });
}
