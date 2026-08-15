import { sql } from "drizzle-orm";
import type { Db } from "../db/bootstrap";

export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

type RateLimitResult = { allowed: boolean; retryAfterMs: number };

export async function checkRateLimit(
  db: Db,
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const result = (await db.run(
    sql`INSERT INTO rate_limits (key, count, window_start) VALUES (${key}, 1, ${now})
        ON CONFLICT(key) DO UPDATE SET
          count = CASE
            WHEN rate_limits.window_start < ${now - windowMs} THEN 1
            ELSE rate_limits.count + 1
          END,
          window_start = CASE
            WHEN rate_limits.window_start < ${now - windowMs} THEN ${now}
            ELSE rate_limits.window_start
          END
        RETURNING count, window_start`,
  )) as unknown as { results?: Array<{ count: number; window_start: number }> };

  const row = result.results?.[0];
  if (!row) return { allowed: true, retryAfterMs: 0 };
  return {
    allowed: row.count <= max,
    retryAfterMs: Math.max(row.window_start + windowMs - now, 0),
  };
}

export async function clearRateLimit(db: Db, key: string): Promise<void> {
  await db.run(sql`DELETE FROM rate_limits WHERE key = ${key}`);
}

export function rateLimitResponse(result: RateLimitResult): Response | null {
  if (result.allowed) return null;
  const headers: Record<string, string> = { "Retry-After": String(Math.max(Math.ceil(result.retryAfterMs / 1000), 1)) };
  if (result.retryAfterMs > 0) headers["X-RateLimit-Reset"] = String(result.retryAfterMs);
  return Response.json(
    { error: "Too many attempts. Try again in a few minutes." },
    { status: 429, headers },
  );
}
