import { sql } from "drizzle-orm";
import { ensureBootstrap, sha256Hex, type Db } from "../db/bootstrap";
import { settings } from "../db/schema";
import { DEFAULT_PASSCODE } from "../db/seed";

export const SESSION_COOKIE = "otb_admin_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PBKDF2_ITERATIONS = 100_000;

export function base64UrlEncode(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readSettingValue(db: Db, key: string): Promise<string> {
  await ensureBootstrap(db);
  const [row] = await db.select().from(settings).where(sql`${settings.key} = ${key}`);
  return row?.value ?? "";
}

export async function readAuthSecret(db: Db): Promise<string> {
  return readSettingValue(db, "authSecret");
}

// Admin session tokens use their own secret so rotating it (on logout or
// passcode change) invalidates every live admin token server-side without
// touching driver sessions.
export async function readAdminSessionSecret(db: Db): Promise<string> {
  return readSettingValue(db, "adminSessionSecret");
}

export async function rotateAdminSessionSecret(db: Db): Promise<void> {
  const secret = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  await setSetting(db, "adminSessionSecret", secret);
}

export type StaffIdentity = {
  /** staff_users.id, or 0 for the shared owner passcode. */
  sid: number;
  role: "owner" | "manager" | "kitchen";
  name: string;
};

export const OWNER_PASSCODE_IDENTITY: StaffIdentity = { sid: 0, role: "owner", name: "Owner (passcode)" };

export async function createSessionToken(db: Db, identity: StaffIdentity = OWNER_PASSCODE_IDENTITY): Promise<string> {
  const secret = await readAdminSessionSecret(db);
  if (!secret) throw new Error("Admin session secret is not initialized");
  const payload = base64UrlEncode(
    JSON.stringify({
      exp: Date.now() + SESSION_TTL_MS,
      jti: crypto.randomUUID().replaceAll("-", ""),
      sid: identity.sid,
      role: identity.role,
      name: identity.name,
    }),
  );
  const signature = await hmacSha256(secret, payload);
  return `${payload}.${signature}`;
}

export async function readSessionToken(db: Db, token: string | undefined | null): Promise<boolean> {
  return (await readStaffSession(db, token)) !== null;
}

/**
 * Verifies an admin session token and returns who it belongs to. Tokens issued
 * before staff accounts existed carry no identity and are treated as the owner.
 * Staff-account tokens are also rejected once the account is deactivated.
 */
export async function readStaffSession(db: Db, token: string | undefined | null): Promise<StaffIdentity | null> {
  if (!(await verifyAdminTokenSignature(db, token))) return null;
  const claims = JSON.parse(base64UrlDecode(token!.slice(0, token!.lastIndexOf(".")))) as {
    sid?: number;
    role?: StaffIdentity["role"];
    name?: string;
  };
  const sid = typeof claims.sid === "number" ? claims.sid : 0;
  if (sid === 0) return { ...OWNER_PASSCODE_IDENTITY, name: claims.name || OWNER_PASSCODE_IDENTITY.name };
  const rows = (await db.run(
    sql`SELECT name, role, active FROM staff_users WHERE id = ${sid} LIMIT 1`,
  )) as unknown as { results?: Array<{ name: string; role: StaffIdentity["role"]; active: number }> };
  const row = rows.results?.[0];
  if (!row || !row.active) return null;
  // Role comes from the database, so a demotion takes effect immediately.
  return { sid, role: row.role, name: row.name };
}

async function verifyAdminTokenSignature(db: Db, token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const secret = await readAdminSessionSecret(db);
  if (!secret) return false;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = await hmacSha256(secret, payload);
  if (!constantTimeEqual(expected, signature)) return false;

  let claims: { exp?: number; jti?: string };
  try {
    claims = JSON.parse(base64UrlDecode(payload)) as { exp?: number; jti?: string };
  } catch {
    return false;
  }
  if (typeof claims.exp !== "number" || claims.exp <= Date.now()) return false;
  if (claims.jti) {
    const revoked = (await db.run(sql`SELECT 1 FROM revoked_sessions WHERE jti = ${claims.jti} LIMIT 1`)) as unknown as {
      results?: unknown[];
    };
    if ((revoked.results?.length ?? 0) > 0) return false;
  }
  return true;
}

// Revokes one admin session token (this device only). Expired rows are
// pruned on the way so the table stays small.
export async function revokeSessionToken(db: Db, token: string): Promise<boolean> {
  if (!(await readSessionToken(db, token))) return false;
  const payload = token.slice(0, token.lastIndexOf("."));
  const { exp, jti } = JSON.parse(base64UrlDecode(payload)) as { exp: number; jti?: string };
  if (!jti) return false; // legacy token without an id: caller falls back to rotation
  await db.run(sql`DELETE FROM revoked_sessions WHERE expires_at < ${Date.now()}`);
  await db.run(sql`INSERT OR IGNORE INTO revoked_sessions (jti, expires_at) VALUES (${jti}, ${exp})`);
  return true;
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

// Native apps (Expo) authenticate with `Authorization: Bearer <token>` instead
// of cookies. The token is the same HMAC-signed session token the cookie
// carries, so verification is identical. Bearer tokens are never sent
// automatically by browsers, so they are not exposed to CSRF.
export function readBearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1];
}

export function readSessionCredential(request: Request, cookieName: string): string | undefined {
  return readCookie(request, cookieName) ?? readBearerToken(request);
}

// Login routes return the raw token in the JSON body only when the caller
// identifies as a native app; browsers keep receiving it solely as an
// HttpOnly cookie so page scripts can never read it.
export function wantsNativeToken(request: Request): boolean {
  return request.headers.get("x-client") === "native";
}

export function requestIsSecure(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function requestIsLocal(request: Request): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(request.url).hostname);
  } catch {
    return false;
  }
}

export function sessionCookieHeader(token: string, maxAge: number, secure = true): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; ${secure ? "Secure; " : ""}Max-Age=${Math.floor(maxAge / 1000)}`;
}

export function clearSessionCookieHeader(secure = true): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; ${secure ? "Secure; " : ""}Max-Age=0`;
}

async function pbkdf2(password: string, salt: string, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomSalt();
  const hash = await pbkdf2(passcode, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${bytesToBase64(hash)}`;
}

function randomSalt(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

async function hashPasscodeWithSalt(passcode: string, salt: string): Promise<string> {
  return sha256Hex(`otb-admin:${salt}:${passcode}`);
}

export async function verifyPasscode(db: Db, passcode: string): Promise<boolean> {
  await ensureBootstrap(db);
  const [row] = await db.select().from(settings).where(sql`${settings.key} = 'adminPasscodeHash'`);
  const stored = row?.value;
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length === 4 && parts[0] === "pbkdf2") {
    const iterations = Number(parts[1]);
    const salt = parts[2];
    if (!Number.isInteger(iterations) || iterations <= 0 || iterations > 10_000_000 || !salt) return false;
    const expected = base64ToBytes(parts[3]);
    const computed = await pbkdf2(passcode, salt, iterations);
    return constantTimeEqualBytes(computed, expected);
  }

  const split = stored.indexOf("$");
  if (split === -1) {
    return constantTimeEqual(await sha256Hex(`otb-admin:${passcode}`), stored);
  }
  const salt = stored.slice(0, split);
  return constantTimeEqual(await hashPasscodeWithSalt(passcode, salt), stored.slice(split + 1));
}

export async function passcodeIsDefault(db: Db): Promise<boolean> {
  return verifyPasscode(db, DEFAULT_PASSCODE);
}

export async function getSetting(db: Db, key: string): Promise<string | null> {
  await ensureBootstrap(db);
  const [row] = await db.select().from(settings).where(sql`${settings.key} = ${key}`);
  return row?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await ensureBootstrap(db);
  const existing = await db.select().from(settings).where(sql`${settings.key} = ${key}`);
  if (existing.length === 0) {
    await db.insert(settings).values({ key, value });
  } else {
    await db.update(settings).set({ value }).where(sql`${settings.key} = ${key}`);
  }
}
