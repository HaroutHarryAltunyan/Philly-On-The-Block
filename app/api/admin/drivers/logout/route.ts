import { requestIsSecure } from "@/lib/admin-auth";
import { clearDriverSessionCookieHeader } from "@/lib/driver-auth";

export async function POST(request: Request) {
  return Response.json(
    { authenticated: false },
    { headers: { "Set-Cookie": clearDriverSessionCookieHeader(requestIsSecure(request)) } },
  );
}
