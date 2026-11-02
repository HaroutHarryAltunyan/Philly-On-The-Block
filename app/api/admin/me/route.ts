import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureBootstrap } from "../../../../db/bootstrap";
import { staffUsers } from "../../../../db/schema";
import { getSetting, passcodeIsDefault, readSessionCredential, readStaffSession, SESSION_COOKIE } from "../../../../lib/admin-auth";

export async function GET(request: Request) {
  try {
    const db = getDb();
    await ensureBootstrap(db);

    const staff = await readStaffSession(db, readSessionCredential(request, SESSION_COOKIE));
    if (!staff) return Response.json({ authenticated: false, passcodeIsDefault: false });

    let mfaEnabled = false;
    if (staff.sid === 0) {
      mfaEnabled = Boolean(await getSetting(db, "ownerTotpSecret"));
    } else {
      const [row] = await db
        .select({ totpSecret: staffUsers.totpSecret })
        .from(staffUsers)
        .where(eq(staffUsers.id, staff.sid))
        .limit(1);
      mfaEnabled = Boolean(row?.totpSecret);
    }

    return Response.json({
      authenticated: true,
      passcodeIsDefault: staff.sid === 0 ? await passcodeIsDefault(db) : false,
      staff,
      mfaEnabled,
    });
  } catch {
    return Response.json({ authenticated: false, passcodeIsDefault: false });
  }
}
