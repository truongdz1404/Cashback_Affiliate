import { NextResponse } from "next/server";

const TOKEN_COOKIE = "admin_token";
const PUBLIC_PATHS = ["/login"];

export function middleware(req) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/login") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  // API routes enforce auth themselves (the backend rejects a missing/invalid
  // token with 401, which the client-side fetch wrapper turns into a
  // redirect) - only page routes are gated here.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
