import { env } from "cloudflare:workers";
import { inArray, sql } from "drizzle-orm";
import type { Db } from "../db/bootstrap";
import { pushTokens } from "../db/schema";

// Expo push service. Works with the Expo push tokens the apps register; it
// delivers through APNs/FCM using the credentials configured on the Expo (EAS)
// project. EXPO_ACCESS_TOKEN is optional (only needed if "enhanced security
// for push" is turned on for the project).

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,}\]$/;

export function isExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

type PushMessage = { title: string; body: string; data?: Record<string, unknown> };

async function send(db: Db, tokens: string[], message: PushMessage): Promise<void> {
  const unique = [...new Set(tokens)].filter(isExpoPushToken);
  if (unique.length === 0) return;
  const accessToken = (env as Record<string, string | undefined>).EXPO_ACCESS_TOKEN;
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(
        unique.map((to) => ({ to, title: message.title, body: message.body, data: message.data ?? {}, sound: "default", priority: "high" })),
      ),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      console.warn("Push send failed", response.status, await response.text().catch(() => ""));
      return;
    }
    const result = (await response.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
    // Drop tokens Expo says are dead (app uninstalled / notifications off).
    const dead = (result.data ?? [])
      .map((ticket, i) => (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered" ? unique[i] : null))
      .filter((t): t is string => Boolean(t));
    if (dead.length) await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
  } catch (error) {
    // Push is best-effort; never fail the order flow because of it.
    console.warn("Push send error", error);
  }
}

export async function pushToStaff(db: Db, message: PushMessage): Promise<void> {
  const rows = await db.select({ token: pushTokens.token }).from(pushTokens).where(sql`${pushTokens.kind} = 'staff'`);
  await send(db, rows.map((r) => r.token), message);
}

export async function pushToDriver(db: Db, driverId: number, message: PushMessage): Promise<void> {
  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(sql`${pushTokens.kind} = 'driver' AND ${pushTokens.driverId} = ${driverId}`);
  await send(db, rows.map((r) => r.token), message);
}

export async function pushToCustomer(db: Db, phoneKey: string, message: PushMessage): Promise<void> {
  if (!phoneKey) return;
  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(sql`${pushTokens.kind} = 'customer' AND ${pushTokens.phoneKey} = ${phoneKey}`);
  await send(db, rows.map((r) => r.token), message);
}
