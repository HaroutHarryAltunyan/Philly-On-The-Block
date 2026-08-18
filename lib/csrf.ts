// Same-origin guard for unauthenticated state-changing endpoints. Browsers
// always send an Origin header on cross-origin form/JSON requests, so a
// mismatched Origin means the request was triggered from a foreign page
// (cross-site request forgery). Requests without an Origin header come from
// non-browser clients (curl, servers, Stripe-style callbacks) and are allowed.
//
// Session-cookie endpoints (admin/driver) are already protected by
// SameSite=Lax; this covers the public POST routes that have no session.
export function isCrossOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  try {
    return new URL(origin).host.toLowerCase() !== host;
  } catch {
    return true;
  }
}

export function crossOriginResponse(): Response {
  return Response.json({ error: "Cross-origin request blocked." }, { status: 403 });
}
