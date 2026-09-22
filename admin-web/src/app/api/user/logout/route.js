import { NextResponse } from "next/server";
import { clearUserSession } from "@/lib/userSession";

// Only touches user_token - an admin signed in on the same browser keeps
// their own session (and vice versa, see /api/logout).
export async function POST() {
  return clearUserSession(NextResponse.json({ ok: true }));
}
