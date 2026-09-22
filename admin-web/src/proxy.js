import { NextResponse } from "next/server";

const USER_TOKEN_COOKIE = "user_token";

// One sign-in for everyone. /account/* needs a session; /admin/* is decided
// by src/app/admin/layout.tsx, which reads the account's role from the
// backend and renders a plain 404 for anyone who is not an admin - there is
// deliberately no redirect to a login page from /admin, so a visitor probing
// the URL learns nothing. Everything else (home, catalog, campaigns, guide,
// login, register) is public - the backend serves catalog content to
// anonymous callers too, see appAuth.optionalAppUser.
export function proxy(req) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") || pathname.startsWith("/_next")) {
    return NextResponse.next();
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
