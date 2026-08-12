import { eq } from "drizzle-orm";
import { sha256Hex, type Db } from "../db/bootstrap";
import { drivers } from "../db/schema";
import {
  base64UrlDecode,
  base64UrlEncode,
  hmacSha256,
  readAuthSecret,
  readCookie,
} from "./admin-auth";

export const DRIVER_COOKIE = "otb_driver_session";
export const DRIVER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

  if ((await hmacSha256(secret, payload)) !== signature) return null;

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

export function driverSessionCookieHeader(token: string): string {
  return `${DRIVER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(DRIVER_SESSION_TTL_MS / 1000)}`;
}

export function clearDriverSessionCookieHeader(): string {
  return `${DRIVER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
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

export async function hashDriverPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  return `${salt}$${await hashDriverPasswordWithSalt(password, salt)}`;
}

async function hashDriverPasswordWithSalt(password: string, salt: string): Promise<string> {
  return sha256Hex(`otb-driver:${salt}:${password}`);
}

export async function verifyDriverPassword(password: string, stored: string): Promise<boolean> {
  const split = stored.indexOf("$");
  if (split === -1) {
    return (await sha256Hex(`otb-driver:${password}`)) === stored;
  }
  const salt = stored.slice(0, split);
  return (await hashDriverPasswordWithSalt(password, salt)) === stored.slice(split + 1);
}
