import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import {
  createSessionToken,
  passcodeIsDefault,
  sessionCookieHeader,
  SESSION_TTL_MS,
  verifyPasscode,
} from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { passcode?: string };
    const passcode = payload.passcode?.trim() ?? "";

    if (!passcode) {
      return Response.json({ error: "Passcode required" }, { status: 400 });
    }

    const db = getDb();
    await ensureBootstrap(db);

    if (!(await verifyPasscode(db, passcode))) {
      return Response.json({ error: "Wrong passcode" }, { status: 401 });
    }

    const token = await createSessionToken(db);
    return Response.json(
      { authenticated: true, passcodeIsDefault: await passcodeIsDefault(db) },
      {
        status: 200,
        headers: { "Set-Cookie": sessionCookieHeader(token, SESSION_TTL_MS) },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Login failed" },
      { status: 500 },
    );
  }
}
