import { clearDriverSessionCookieHeader } from "@/lib/driver-auth";

export async function POST() {
  return Response.json(
    { authenticated: false },
    { headers: { "Set-Cookie": clearDriverSessionCookieHeader() } },
  );
}
