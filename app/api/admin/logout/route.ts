import { clearSessionCookieHeader, requestIsSecure } from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  return Response.json(
    { authenticated: false },
    { headers: { "Set-Cookie": clearSessionCookieHeader(requestIsSecure(request)) } },
  );
}
