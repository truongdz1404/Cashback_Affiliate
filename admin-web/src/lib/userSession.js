import { NextResponse } from "next/server";
import { USER_TOKEN_COOKIE_NAME } from "@/lib/api";

// 30 days, matching the app_user JWT's own lifetime (playwright-service
// lib/appAuth.js issueAppToken) - a cookie that outlives the token would
// just produce silent 401s.
const USER_TOKEN_MAX_AGE = 60 * 60 * 24 * 30;

export function setUserSession(res, token) {
  res.cookies.set(USER_TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: USER_TOKEN_MAX_AGE,
  });
  return res;
}

export function clearUserSession(res) {
  res.cookies.set(USER_TOKEN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

// Shared body for POST /api/user/login, /register, /login/google and
// /login/facebook: all four hit a backend route that answers
// { token, user } and all four turn that into the same httpOnly cookie.
export async function loginThrough(backendPath, body) {
  const BACKEND_URL = process.env.BACKEND_URL || "http://shopee-affiliate:4000";
  const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

  let res;
  try {
    res = await fetch(`${BACKEND_URL}${backendPath}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": BACKEND_API_KEY },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Không thể kết nối máy chủ, kiểm tra lại mạng." }, { status: 502 });
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok || !data?.token) {
    return NextResponse.json({ error: data?.error || "Đăng nhập thất bại, thử lại nhé." }, { status: res.status || 500 });
  }

  return setUserSession(NextResponse.json({ ok: true, user: data.user }), data.token);
}
