import { NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/api";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TOKEN_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
