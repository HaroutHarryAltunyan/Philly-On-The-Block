import { sql } from "drizzle-orm";
import { ensureBootstrap, sha256Hex, type Db } from "../db/bootstrap";
import { settings } from "../db/schema";
import { DEFAULT_PASSCODE } from "../db/seed";

export const SESSION_COOKIE = "otb_admin_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function base64UrlEncode(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
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

export async function readAuthSecret(db: Db): Promise<string> {
  await ensureBootstrap(db);
  const [row] = await db.select().from(settings).where(sql`${settings.key} = 'authSecret'`);
  return row?.value ?? "";
}

export async function createSessionToken(db: Db): Promise<string> {
  const secret = await readAuthSecret(db);
  const payload = base64UrlEncode(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }));
  const signature = await hmacSha256(secret, payload);
  return `${payload}.${signature}`;
}

export async function readSessionToken(db: Db, token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const secret = await readAuthSecret(db);
  if (!secret) return false;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = await hmacSha256(secret, payload);
  if (expected !== signature) return false;

  try {
    const { exp } = JSON.parse(base64UrlDecode(payload)) as { exp?: number };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
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

export function sessionCookieHeader(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomSalt();
  return `${salt}$${await hashPasscodeWithSalt(passcode, salt)}`;
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
  const split = stored.indexOf("$");
  if (split === -1) {
    return (await sha256Hex(`otb-admin:${passcode}`)) === stored;
  }
  const salt = stored.slice(0, split);
  return (await hashPasscodeWithSalt(passcode, salt)) === stored.slice(split + 1);
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
