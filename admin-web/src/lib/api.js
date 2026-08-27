import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const TOKEN_COOKIE_NAME = "admin_token";

const BACKEND_URL = process.env.BACKEND_URL || "http://shopee-affiliate:4000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

export class BackendError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Every call into playwright-service's /admin/* API needs both the shared
// x-api-key (held only here, server-side - the browser never sees it) and
// the admin's JWT (read from the httpOnly cookie set by /api/login).
export async function backendFetch(path, init = {}) {
  const jar = await cookies();
  const token = jar.get(TOKEN_COOKIE_NAME)?.value;

  const headers = new Headers(init.headers);
  headers.set("x-api-key", BACKEND_API_KEY);
  if (init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const res = await fetch(`${BACKEND_URL}${path}`, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new BackendError(res.status, (data && data.error) || `backend error ${res.status}`);
  }
  return data;
}

function errorResponse(err) {
  if (err instanceof BackendError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return NextResponse.json({ error: err.message || "unexpected error" }, { status: 500 });
}

export async function proxyGet(path) {
  try {
    return NextResponse.json(await backendFetch(path));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function proxyMutate(path, method, body) {
  try {
    return NextResponse.json(
      await backendFetch(path, { method, body: body !== undefined ? JSON.stringify(body) : undefined })
    );
  } catch (err) {
    return errorResponse(err);
  }
}
