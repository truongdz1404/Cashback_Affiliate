import { NextResponse } from "next/server";
import { backendFetch, BackendError, TOKEN_COOKIE_NAME } from "@/lib/api";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  try {
    const data = await backendFetch("/admin/login", { method: "POST", body: JSON.stringify(body) });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(TOKEN_COOKIE_NAME, data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  } catch (err) {
    if (err instanceof BackendError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "đăng nhập thất bại" }, { status: 500 });
  }
}
