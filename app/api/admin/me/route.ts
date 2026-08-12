import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import {
  passcodeIsDefault,
  readCookie,
  readSessionToken,
  SESSION_COOKIE,
} from "../../../../lib/admin-auth";

export async function GET(request: Request) {
  try {
    const db = getDb();
    await ensureBootstrap(db);

    const token = readCookie(request, SESSION_COOKIE);
    const authenticated = await readSessionToken(db, token);

    return Response.json({
      authenticated,
      passcodeIsDefault: await passcodeIsDefault(db),
    });
  } catch {
    return Response.json({ authenticated: false, passcodeIsDefault: false });
  }
}
