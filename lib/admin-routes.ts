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
