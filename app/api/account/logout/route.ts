import { getDb } from "../../../../db";
import { requestIsSecure } from "../../../../lib/admin-auth";
import { crossOriginResponse, isCrossOrigin } from "../../../../lib/csrf";
import { clearAccountHintCookieHeader, clearCustomerCookieHeader, customerFromRequest, signOutEverywhere } from "../../../../lib/customer-auth";

// Signs the account out on every device (bumps its session version).
export async function POST(request: Request) {
  if (isCrossOrigin(request)) return crossOriginResponse();
  try {
    const db = getDb();
    const customer = await customerFromRequest(db, request);
    if (customer) await signOutEverywhere(db, customer.id);
  } catch (error) {
    // Best-effort: the cookie is still cleared below.
    console.error("Customer sign-out failed", error);
  }
  const headers = new Headers();
  headers.append("Set-Cookie", clearCustomerCookieHeader(requestIsSecure(request)));
  headers.append("Set-Cookie", clearAccountHintCookieHeader(requestIsSecure(request)));
  return Response.json({ authenticated: false }, { headers });
}
