import { NextRequest, NextResponse } from "next/server";

const ADMIN_HOSTS = new Set(["admin.phillyontheblock.com", "admin.localhost"]);
const DRIVER_HOSTS = new Set(["driver.phillyontheblock.com", "driver.localhost"]);

export default function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const { pathname } = request.nextUrl;

  if (ADMIN_HOSTS.has(host) && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (DRIVER_HOSTS.has(host) && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard/drivers/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
