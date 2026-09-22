import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://shopee-affiliate:4000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

// Public, non-secret config (just which OAuth providers are enabled and
// their client IDs) - proxied only because the backend requires x-api-key
// on every route, and that key must stay server-side.
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/app/oauth-config`, {
      headers: { "x-api-key": BACKEND_API_KEY },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    // `unavailable` distinguishes "the backend is down" from "the operator
    // turned this provider off". The login page hides a disabled provider but
    // keeps showing an unavailable one, so a visitor is never left staring at
    // a login box whose Google button silently vanished.
    return NextResponse.json(
      { unavailable: true, google: { enabled: false }, facebook: { enabled: false } },
      { status: 200 },
    );
  }
}
