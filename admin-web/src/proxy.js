import { NextResponse } from "next/server";

const ADMIN_TOKEN_COOKIE = "admin_token";
const USER_TOKEN_COOKIE = "user_token";

// Two independent realms on one deployment:
//   /admin/*   -> dashboard, needs admin_token
//   /account/* -> the visitor's own wallet/orders/profile, needs user_token
// Everything else (home, catalog, campaigns, guide, login, register) is
// public - the backend serves catalog content to anonymous callers too, see
// appAuth.optionalAppUser.
export function proxy(req) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (pathname === "/admin/login") return NextResponse.next();
  if (pathname.startsWith("/admin")) {
    if (req.cookies.get(ADMIN_TOKEN_COOKIE)?.value) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/account")) {
    if (req.cookies.get(USER_TOKEN_COOKIE)?.value) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Bounce back to where they were headed once signed in.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Already signed in: /login and /register have nothing left to offer.
  if ((pathname === "/login" || pathname === "/register") && req.cookies.get(USER_TOKEN_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/account";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
