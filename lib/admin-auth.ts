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
  if (!constantTimeEqual(expected, signature)) return false;

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

export function requestIsSecure(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
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
