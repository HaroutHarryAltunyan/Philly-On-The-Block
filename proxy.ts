import { NextRequest, NextResponse } from "next/server";

const ADMIN_HOSTS = new Set(["admin.phillyontheblock.com", "admin.localhost"]);
const DRIVER_HOSTS = new Set(["driver.phillyontheblock.com", "driver.localhost"]);

// Security headers for every response. CSP needs 'unsafe-inline' for the Meta
// Pixel base snippet and the JSON-LD/PWA scripts, and external hosts only for
// the pixel (connect.facebook.net, www.facebook.com) and OSM map tiles.
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://connect.facebook.net; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob: https://connect.facebook.net https://www.facebook.com *.tile.openstreetmap.org; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https://connect.facebook.net https://www.facebook.com https://graph.facebook.com; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export default function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const { pathname } = request.nextUrl;

  if (ADMIN_HOSTS.has(host) && pathname === "/") {
    return withSecurityHeaders(NextResponse.redirect(new URL("/dashboard", request.url)));
  }
  if (DRIVER_HOSTS.has(host) && pathname === "/") {
    return withSecurityHeaders(
      NextResponse.redirect(new URL("/dashboard/drivers/login", request.url)),
    );
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: "/:path*",
};
