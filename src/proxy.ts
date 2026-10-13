import { NextResponse, type NextRequest } from "next/server";

// 1. Content Security Policy for every page, with a fresh nonce per request (Next.js adds it to its
//    own scripts during dynamic rendering; every SIMS page is dynamic because it reads the session).
// 2. Coarse gate for pages only: bounces requests without a session cookie to /login. Real session
//    validation and authorization happen on the server (requireUser, and the API router, which
//    answers /api requests with JSON 401/403 errors itself).
const PUBLIC_PREFIXES = ["/login", "/request-access", "/api"];
const SESSION_COOKIES = ["sims_session", "__Host-sims_session"];

function contentSecurityPolicy(nonce: string, request: NextRequest): string {
  const dev = process.env.NODE_ENV === "development";
  const https = request.nextUrl.protocol === "https:";
  return [
    "default-src 'self'",
    // React needs eval only in development (error overlays and stack reconstruction).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // React and the animation library write style attributes, which nonces cannot cover.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/api" || pathname.startsWith("/api/")) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, request);
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  let response: NextResponse;
  if (isPublic || SESSION_COOKIES.some((c) => request.cookies.has(c))) {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    response = NextResponse.next({ request: { headers } });
  } else {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    response = NextResponse.redirect(url);
  }
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)"],
};
