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
    // blob: lets the 3D model loader read textures embedded in our own .glb files.
    "connect-src 'self' blob: https://connect.facebook.net https://www.facebook.com https://graph.facebook.com; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

// Old and alternate customer URLs. Permanent, so search engines move their
// ranking to the new pages; query strings carry over.
const REDIRECTS: Record<string, string> = {
  "/portal": "/rewards",
  "/reserve": "/events",
  "/signup": "/login",
  "/track-order": "/track",
  "/account/orders": "/account#orders",
  "/account/rewards": "/account#rewards",
  "/our_story": "/our-story",
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

  // One canonical URL per page: plain http:// was served as a second copy of
  // the whole site. Local development (localhost, *.localhost) stays on http.
  const urlHost = request.nextUrl.hostname.toLowerCase();
  const isLocal = [host, urlHost].some((h) => h === "" || h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost"));
  if (!isLocal && request.nextUrl.protocol === "http:") {
    const target = new URL(request.url);
    target.protocol = "https:";
    target.port = "";
    if (target.hostname === "www.phillyontheblock.com") target.hostname = "phillyontheblock.com";
    return withSecurityHeaders(NextResponse.redirect(target, 301));
  }

  // One canonical host: send www. to the bare domain with a permanent redirect.
  if (host === "www.phillyontheblock.com") {
    const target = new URL(request.url);
    target.host = "phillyontheblock.com";
    target.port = "";
    target.protocol = "https:";
    return withSecurityHeaders(NextResponse.redirect(target, 301));
  }

  const redirectTo = REDIRECTS[pathname.replace(/\/+$/, "") || "/"];
  if (redirectTo) {
    const target = new URL(redirectTo, request.url);
    if (!redirectTo.includes("#")) target.search = request.nextUrl.search;
    return withSecurityHeaders(NextResponse.redirect(target, 308));
  }

  if (ADMIN_HOSTS.has(host) && pathname === "/") {
    return withSecurityHeaders(NextResponse.redirect(new URL("/dashboard", request.url)));
  }
  if (DRIVER_HOSTS.has(host) && pathname === "/") {
    return withSecurityHeaders(
      NextResponse.redirect(new URL("/dashboard/drivers/login", request.url)),
    );
  }

  const response = withSecurityHeaders(NextResponse.next());
  // Page requests: tell the browser about the header logo (the mobile LCP
  // element) in the response headers, so it starts downloading before the
  // HTML is parsed instead of queueing behind ~20 script preloads.
  // Cloudflare can also send this as a 103 Early Hint.
  if (request.method === "GET" && !pathname.startsWith("/api/") && !pathname.startsWith("/_next/") && !/\.[a-z0-9]+$/i.test(pathname)) {
    response.headers.append("Link", "</images/otb-logo-header.webp>; rel=preload; as=image; type=image/webp; fetchpriority=high");
  }
  // The admin/driver hosts serve the same Worker; keep them out of search
  // results so they don't compete with phillyontheblock.com.
  if (ADMIN_HOSTS.has(host) || DRIVER_HOSTS.has(host)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: "/:path*",
};
