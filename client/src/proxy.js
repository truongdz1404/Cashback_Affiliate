import { NextResponse } from "next/server";

const USER_TOKEN_COOKIE = "user_token";

// Signing in is a dialog over whatever page the visitor is on, so /login and
// /register no longer render screens of their own. The two URLs stay alive
// because they are pointed at from everywhere that matters - invite links
// (/register?ref=CODE) already sent to real people, old bookmarks, the
// bounce below, the dashboard's 401 handler - and now land on the home page
// with ?auth=, which AuthDialog opens the dialog from.
const AUTH_PAGES = { "/login": "login", "/register": "register" };

// One sign-in for everyone. /account/* needs a session; /admin/* is decided
// by src/app/admin/layout.tsx, which reads the account's role from the
// backend and renders a plain 404 for anyone who is not an admin - there is
// deliberately no redirect to a login page from /admin, so a visitor probing
// the URL learns nothing. Everything else (home, catalog, campaigns, guide)
// is public - the backend serves catalog content to anonymous callers too,
// see appAuth.optionalAppUser.
export function proxy(req) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const signedIn = Boolean(req.cookies.get(USER_TOKEN_COOKIE)?.value);

  if (pathname.startsWith("/account")) {
    if (signedIn) return NextResponse.next();
    // Bounce back to where they were headed once signed in.
    return NextResponse.redirect(authDialogUrl(req, "login", pathname + req.nextUrl.search));
  }

  const mode = AUTH_PAGES[pathname];
  if (mode) {
    // Already signed in: neither URL has anything left to offer.
    if (signedIn) {
      const url = req.nextUrl.clone();
      url.pathname = "/account";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.redirect(authDialogUrl(req, mode, req.nextUrl.searchParams.get("next")));
  }

  return NextResponse.next();
}

// The home page with the sign-in dialog open. ?ref= is carried across because
// an invite link is the one case where the query string is worth more than
// the page it points at - ReferralCapture reads it on arrival.
function authDialogUrl(req, mode, next) {
  const referral = req.nextUrl.searchParams.get("ref") || req.nextUrl.searchParams.get("referralCode");
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("auth", mode);
  if (referral) url.searchParams.set("ref", referral);
  // Same-origin paths only: a crafted ?next= must not turn signing in into an
  // open redirect.
  if (next && next.startsWith("/") && !next.startsWith("//")) url.searchParams.set("next", next);
  return url;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
