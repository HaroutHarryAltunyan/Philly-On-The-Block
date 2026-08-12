import { clearSessionCookieHeader } from "../../../../lib/admin-auth";

export async function POST() {
  return Response.json(
    { authenticated: false },
    { headers: { "Set-Cookie": clearSessionCookieHeader() } },
  );
}
