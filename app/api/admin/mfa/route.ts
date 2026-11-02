import { eq } from "drizzle-orm";
import { staffUsers } from "@/db/schema";
import { getSetting, setSetting } from "@/lib/admin-auth";
import { requireStaff, toErrorResponse } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";

// Two-factor setup for whoever is signed in (owner passcode or staff account).
//   { action: "setup" }              -> new pending secret + otpauth:// URI
//   { action: "confirm", code }      -> turns two-factor on
//   { action: "disable", code }      -> turns it off (needs a current code)
export async function POST(request: Request) {
  try {
    const { db, actor } = await requireStaff(request);
    const payload = (await request.json()) as { action?: string; code?: string };
    const code = payload.code ?? "";

    const read = async () => {
      if (actor.sid === 0) {
        return { secret: (await getSetting(db, "ownerTotpSecret")) ?? "", pending: (await getSetting(db, "ownerTotpPending")) ?? "" };
      }
      const [row] = await db.select().from(staffUsers).where(eq(staffUsers.id, actor.sid)).limit(1);
      return { secret: row?.totpSecret ?? "", pending: row?.totpPending ?? "" };
    };
    const write = async (values: { secret?: string; pending?: string }) => {
      if (actor.sid === 0) {
        if (values.secret !== undefined) await setSetting(db, "ownerTotpSecret", values.secret);
        if (values.pending !== undefined) await setSetting(db, "ownerTotpPending", values.pending);
        return;
      }
      await db
        .update(staffUsers)
        .set({
          ...(values.secret !== undefined ? { totpSecret: values.secret } : {}),
          ...(values.pending !== undefined ? { totpPending: values.pending } : {}),
        })
        .where(eq(staffUsers.id, actor.sid));
    };

    const state = await read();
    if (payload.action === "setup") {
      if (state.secret) return Response.json({ error: "Two-factor is already on" }, { status: 409 });
      const pending = generateTotpSecret();
      await write({ pending });
      return Response.json({ secret: pending, uri: totpUri(pending, actor.name) });
    }
    if (payload.action === "confirm") {
      if (!state.pending || !(await verifyTotp(state.pending, code))) {
        return Response.json({ error: "That code didn't match. Scan the QR again or try the newest code." }, { status: 400 });
      }
      await write({ secret: state.pending, pending: "" });
      await audit(db, request, actor, "mfa.enable");
      return Response.json({ mfaEnabled: true });
    }
    if (payload.action === "disable") {
      if (!state.secret || !(await verifyTotp(state.secret, code))) {
        return Response.json({ error: "Enter a current code to turn two-factor off" }, { status: 400 });
      }
      await write({ secret: "", pending: "" });
      await audit(db, request, actor, "mfa.disable");
      return Response.json({ mfaEnabled: false });
    }
    return Response.json({ error: 'action must be "setup", "confirm" or "disable"' }, { status: 400 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
