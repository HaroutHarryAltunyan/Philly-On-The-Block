import { AuthError, requireAdmin, toErrorResponse } from "../../../../lib/admin-routes";
import {
  getSetting,
  hashPasscode,
  passcodeIsDefault,
  rotateAdminSessionSecret,
  setSetting,
} from "../../../../lib/admin-auth";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidHours(hours: unknown): hours is Record<string, [string, string]> {
  if (typeof hours !== "object" || hours === null || Array.isArray(hours)) return false;
  const record = hours as Record<string, unknown>;
  for (const day of DAYS) {
    const pair = record[day];
    if (!Array.isArray(pair) || pair.length !== 2) return false;
    const [open, close] = pair;
    const closed = open === "closed" || close === "" || close === "closed";
    if (closed) continue;
    if (typeof open !== "string" || !TIME_RE.test(open)) return false;
    if (typeof close !== "string" || !TIME_RE.test(close)) return false;
  }
  return true;
}

export async function GET(request: Request) {
  try {
    const db = await requireAdmin(request);

    const hoursRaw = await getSetting(db, "weeklyHours");
    const weeklyHours = hoursRaw ? (JSON.parse(hoursRaw) as unknown) : null;
    const readFee = async (key: string, fallback: number) => {
      const raw = await getSetting(db, key);
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    };

    return Response.json({
      settings: {
        weeklyHours,
        passcodeIsDefault: await passcodeIsDefault(db),
        fees: {
          serviceFeeCents: Math.round(await readFee("serviceFeeCents", 150)),
          taxRatePercent: await readFee("taxRatePercent", 8),
          deliveryFeeCents: Math.round(await readFee("deliveryFeeCents", 0)),
        },
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const db = await requireAdmin(request);
    const payload = (await request.json()) as {
      weeklyHours?: Record<string, [string, string]>;
      passcode?: string;
      fees?: { serviceFeeCents?: number; taxRatePercent?: number; deliveryFeeCents?: number };
    };

    if (payload.weeklyHours !== undefined) {
      if (!isValidHours(payload.weeklyHours)) {
        return Response.json(
          { error: `weeklyHours must map each day (${DAYS.join(", ")}) to [open, close] times like "09:00" or "closed"` },
          { status: 400 },
        );
      }
      await setSetting(db, "weeklyHours", JSON.stringify(payload.weeklyHours));
    }

    if (payload.passcode !== undefined) {
      const passcode = payload.passcode;
      if (typeof passcode !== "string" || passcode.length < 6) {
        return Response.json({ error: "passcode must be at least 6 characters" }, { status: 400 });
      }
      await setSetting(db, "adminPasscodeHash", await hashPasscode(passcode));
      // A leaked or reset passcode may mean live admin sessions are
      // compromised: rotate the token secret so they stop working now.
      await rotateAdminSessionSecret(db);
    }

    if (payload.fees !== undefined) {
      const { serviceFeeCents, taxRatePercent, deliveryFeeCents } = payload.fees;
      const validate = (value: unknown, label: string) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return `${label} must be a non-negative number`;
        }
        return null;
      };
      const errors = [
        serviceFeeCents !== undefined ? validate(serviceFeeCents, "serviceFeeCents") : null,
        deliveryFeeCents !== undefined ? validate(deliveryFeeCents, "deliveryFeeCents") : null,
        taxRatePercent !== undefined ? validate(taxRatePercent, "taxRatePercent") : null,
      ].filter(Boolean);
      if (errors.length > 0) {
        return Response.json({ error: errors.join("; ") }, { status: 400 });
      }

      const applyCents = async (key: string, value: number | undefined) => {
        if (value === undefined) return;
        await setSetting(db, key, String(Math.round(value)));
      };
      const applyPercent = async (key: string, value: number | undefined) => {
        if (value === undefined) return;
        await setSetting(db, key, String(value));
      };
      await applyCents("serviceFeeCents", serviceFeeCents);
      await applyCents("deliveryFeeCents", deliveryFeeCents);
      await applyPercent("taxRatePercent", taxRatePercent);
    }

    const hoursRaw = await getSetting(db, "weeklyHours");
    const readFee = async (key: string, fallback: number) => {
      const raw = await getSetting(db, key);
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    };
    return Response.json({
      settings: {
        weeklyHours: hoursRaw ? (JSON.parse(hoursRaw) as unknown) : null,
        passcodeIsDefault: await passcodeIsDefault(db),
        fees: {
          serviceFeeCents: Math.round(await readFee("serviceFeeCents", 150)),
          taxRatePercent: await readFee("taxRatePercent", 8),
          deliveryFeeCents: Math.round(await readFee("deliveryFeeCents", 0)),
        },
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}
