import { sql } from "drizzle-orm";
import { ensureBootstrap, sha256Hex, type Db } from "../db/bootstrap";
import { customers } from "../db/schema";
import {
  base64UrlDecode,
  base64UrlEncode,
  constantTimeEqual,
  getSetting,
  hmacSha256,
  readBearerToken,
  readCookie,
} from "./admin-auth";

// Customer accounts sign in with a one-time emailed link (no passwords).
// Sessions are HMAC-signed tokens like admin sessions, but signed with their
// own secret and carrying the account's session version, so "sign out"
// invalidates every device for that account without touching staff.

export const CUSTOMER_COOKIE = "otb_customer_session";
export const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;

export type Customer = typeof customers.$inferSelect;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  if (email.length === 0 || email.length > 320 || !EMAIL_RE.test(email)) return null;
  return email;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Creates a one-time sign-in token for `email` and returns the raw token. */
export async function createLoginToken(db: Db, email: string): Promise<string> {
  await ensureBootstrap(db);
  const token = randomToken();
  const now = Date.now();
  // Housekeeping: drop expired links so the table stays small.
  await db.run(sql`DELETE FROM customer_login_tokens WHERE expires_at < ${now - LOGIN_TOKEN_TTL_MS}`);
  await db.run(
    sql`INSERT INTO customer_login_tokens (token_hash, email, expires_at, used_at, created_at)
        VALUES (${await sha256Hex(token)}, ${email}, ${now + LOGIN_TOKEN_TTL_MS}, NULL, ${now})`,
  );
  return token;
}

/**
 * Consumes a sign-in token. Returns the customer (created on first sign-in)
 * or null when the token is unknown, expired, or already used. The UPDATE ...
 * WHERE used_at IS NULL makes consumption single-use even under concurrency.
 */
export async function consumeLoginToken(db: Db, token: string): Promise<Customer | null> {
  if (!token || token.length > 128) return null;
  await ensureBootstrap(db);
  const now = Date.now();
  const result = (await db.run(
    sql`UPDATE customer_login_tokens SET used_at = ${now}
        WHERE token_hash = ${await sha256Hex(token)} AND used_at IS NULL AND expires_at > ${now}
        RETURNING email`,
  )) as unknown as { results?: Array<{ email: string }> };
  const email = result.results?.[0]?.email;
  if (!email) return null;

  await db.run(
    sql`INSERT INTO customers (email, created_at, last_login_at) VALUES (${email}, ${now}, ${now})
        ON CONFLICT(email) DO UPDATE SET last_login_at = ${now}`,
  );
  const [customer] = await db.select().from(customers).where(sql`${customers.email} = ${email}`);
  return customer ?? null;
}

async function sessionSecret(db: Db): Promise<string> {
  const secret = await getSetting(db, "customerSessionSecret");
  if (!secret) throw new Error("Customer session secret is not initialized");
  return secret;
}

export async function createCustomerSession(db: Db, customer: Customer): Promise<string> {
  const payload = base64UrlEncode(
    JSON.stringify({ cid: customer.id, v: customer.sessionVersion, exp: Date.now() + CUSTOMER_SESSION_TTL_MS }),
  );
  return `${payload}.${await hmacSha256(await sessionSecret(db), payload)}`;
}

export async function readCustomerSession(db: Db, token: string | undefined | null): Promise<Customer | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const expected = await hmacSha256(await sessionSecret(db), payload);
  if (!constantTimeEqual(expected, token.slice(dot + 1))) return null;

  let claims: { cid?: number; v?: number; exp?: number };
  try {
    claims = JSON.parse(base64UrlDecode(payload)) as typeof claims;
  } catch {
    return null;
  }
  if (typeof claims.exp !== "number" || claims.exp <= Date.now()) return null;
  if (typeof claims.cid !== "number") return null;

  const [customer] = await db.select().from(customers).where(sql`${customers.id} = ${claims.cid}`);
  if (!customer || customer.sessionVersion !== (claims.v ?? 0)) return null;
  return customer;
}

/** Signed-in customer for this request (cookie for the website, bearer for apps). */
export async function customerFromRequest(db: Db, request: Request): Promise<Customer | null> {
  await ensureBootstrap(db);
  const cookie = readCookie(request, CUSTOMER_COOKIE);
  const bearer = request.headers.get("x-client") === "native" ? readBearerToken(request) : undefined;
  return readCustomerSession(db, cookie ?? bearer);
}

export async function signOutEverywhere(db: Db, customerId: number): Promise<void> {
  await db.run(sql`UPDATE customers SET session_version = session_version + 1 WHERE id = ${customerId}`);
}

export function customerCookieHeader(token: string, secure: boolean): string {
  return `${CUSTOMER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; ${secure ? "Secure; " : ""}Max-Age=${Math.floor(CUSTOMER_SESSION_TTL_MS / 1000)}`;
}

export function clearCustomerCookieHeader(secure: boolean): string {
  return `${CUSTOMER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; ${secure ? "Secure; " : ""}Max-Age=0`;
}

// Readable, secret-free companion cookie: only tells the page "show Account,
// not Log in". Authorization always uses the HttpOnly session above.
const HINT_COOKIE = "otb_has_account";

export function accountHintCookieHeader(secure: boolean): string {
  return `${HINT_COOKIE}=1; Path=/; SameSite=Lax; ${secure ? "Secure; " : ""}Max-Age=${Math.floor(CUSTOMER_SESSION_TTL_MS / 1000)}`;
}

export function clearAccountHintCookieHeader(secure: boolean): string {
  return `${HINT_COOKIE}=; Path=/; SameSite=Lax; ${secure ? "Secure; " : ""}Max-Age=0`;
}
