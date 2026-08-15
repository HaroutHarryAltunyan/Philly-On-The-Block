import { eq } from "drizzle-orm";
import { sha256Hex, type Db } from "../db/bootstrap";
import { drivers } from "../db/schema";
import {
  base64ToBytes,
  base64UrlDecode,
  base64UrlEncode,
  bytesToBase64,
  constantTimeEqual,
  hmacSha256,
  readAuthSecret,
  readCookie,
} from "./admin-auth";

export const DRIVER_COOKIE = "otb_driver_session";
export const DRIVER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PBKDF2_ITERATIONS = 100_000;

export type DriverSession = { id: number; exp: number };

export async function createDriverSessionToken(db: Db, driverId: number): Promise<string> {
  const secret = await readAuthSecret(db);
  const payload = base64UrlEncode(JSON.stringify({ id: driverId, exp: Date.now() + DRIVER_SESSION_TTL_MS }));
  const signature = await hmacSha256(secret, payload);
  return `${payload}.${signature}`;
}

export async function readDriverSession(request: Request, db: Db): Promise<DriverSession | null> {
  const token = readCookie(request, DRIVER_COOKIE);
  if (!token) return null;
  const secret = await readAuthSecret(db);
  if (!secret) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  if (!constantTimeEqual(await hmacSha256(secret, payload), signature)) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as { id?: number; exp?: number };
    if (typeof decoded.id !== "number" || typeof decoded.exp !== "number" || decoded.exp <= Date.now()) {
      return null;
    }
    return { id: decoded.id, exp: decoded.exp };
  } catch {
    return null;
  }
}

export function driverSessionCookieHeader(token: string, secure = true): string {
  return `${DRIVER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; ${secure ? "Secure; " : ""}Max-Age=${Math.floor(DRIVER_SESSION_TTL_MS / 1000)}`;
}

export function clearDriverSessionCookieHeader(secure = true): string {
  return `${DRIVER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; ${secure ? "Secure; " : ""}Max-Age=0`;
}

export async function getDriver(db: Db, id: number) {
  const [row] = await db.select().from(drivers).where(eq(drivers.id, id)).limit(1);
  return row;
}

export async function getActiveDriverFromRequest(request: Request, db: Db) {
  const session = await readDriverSession(request, db);
  if (!session) return null;
  const driver = await getDriver(db, session.id);
  if (!driver || driver.status !== "active") return null;
  return driver;
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

export async function hashDriverPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${bytesToBase64(hash)}`;
}

async function hashDriverPasswordWithSalt(password: string, salt: string): Promise<string> {
  return sha256Hex(`otb-driver:${salt}:${password}`);
}

export async function verifyDriverPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length === 4 && parts[0] === "pbkdf2") {
    const iterations = Number(parts[1]);
    const salt = parts[2];
    if (!Number.isInteger(iterations) || iterations <= 0 || iterations > 10_000_000 || !salt) return false;
    const expected = base64ToBytes(parts[3]);
    const computed = await pbkdf2(password, salt, iterations);
    if (computed.byteLength !== expected.byteLength) return false;
    let diff = 0;
    for (let i = 0; i < computed.byteLength; i++) diff |= computed[i] ^ expected[i];
    return diff === 0;
  }

  const split = stored.indexOf("$");
  if (split === -1) {
    return constantTimeEqual(await sha256Hex(`otb-driver:${password}`), stored);
  }
  const salt = stored.slice(0, split);
  return constantTimeEqual(await hashDriverPasswordWithSalt(password, salt), stored.slice(split + 1));
}
