import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { USER_TOKEN_COOKIE_NAME } from "@/lib/api";

const BACKEND_URL = process.env.BACKEND_URL || "http://shopee-affiliate:4000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

// Catch-all proxy from /api/user/<x> to the backend's /app/<x>, so
// client components can reach the app API without the JWT ever leaving the
// httpOnly cookie. The auth routes that have to SET that cookie
// (login, register, login/google, login/facebook, logout) are explicit files
// alongside this one and take precedence over the catch-all.
//
// This forwards only to /app/*, which is exactly the surface an app user is
// allowed to touch - the backend still enforces its own authorization on
// every one of those routes.
async function forward(req, method, pathSegments) {
  const jar = await cookies();
  const token = jar.get(USER_TOKEN_COOKIE_NAME)?.value;

  const headers = new Headers();
  headers.set("x-api-key", BACKEND_API_KEY);
  if (token) headers.set("authorization", `Bearer ${token}`);

  let body;
  if (method !== "GET" && method !== "DELETE") {
    const raw = await req.text();
    if (raw) {
      body = raw;
      headers.set("content-type", "application/json");
    }
  }

  const search = new URL(req.url).search;
  const path = pathSegments.map(encodeURIComponent).join("/");

  try {
    const res = await fetch(`${BACKEND_URL}/app/${path}${search}`, {
      method,
      headers,
      body,
      cache: "no-store",
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Không thể kết nối máy chủ, kiểm tra lại mạng." }, { status: 502 });
  }
}

export async function GET(req, { params }) {
  const { path } = await params;
  return forward(req, "GET", path);
}

export async function POST(req, { params }) {
  const { path } = await params;
  return forward(req, "POST", path);
}

export async function PUT(req, { params }) {
  const { path } = await params;
  return forward(req, "PUT", path);
}

export async function DELETE(req, { params }) {
  const { path } = await params;
  return forward(req, "DELETE", path);
}
