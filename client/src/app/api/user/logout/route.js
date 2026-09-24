import { NextResponse } from "next/server";
import { clearUserSession } from "@/lib/userSession";

export async function POST() {
  return clearUserSession(NextResponse.json({ ok: true }));
}

// GET variant for the "stale cookie" case: the browser still carries a
// user_token the backend no longer honours (rotated jwtSecret, deleted
// account, expired JWT). proxy.js would keep bouncing such a visitor between
// /login and /account, so server code sends them here instead - the cookie
// is dropped and they land on a real page.
export async function GET(req) {
  const next = req.nextUrl.searchParams.get("next") || "/login";
  // Same-origin paths only, never a full URL from the query string. The
  // path may carry its own query (e.g. /login?next=/account), so it is
  // resolved against this origin rather than assigned to `pathname`, which
  // would percent-encode the "?".
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/login";
  return clearUserSession(NextResponse.redirect(new URL(target, req.nextUrl.origin)));
}
