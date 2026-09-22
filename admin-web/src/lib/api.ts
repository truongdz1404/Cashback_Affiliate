import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// One cookie for everyone. There is no separate admin session: the dashboard
// is unlocked by users.role === "admin" on the same account the visitor uses
// to shop (see src/app/admin/layout.tsx and playwright-service
// lib/adminAuth.js#requireAdmin, which re-checks the role on every request).
export const USER_TOKEN_COOKIE_NAME = "user_token";

const BACKEND_URL = process.env.BACKEND_URL || "http://shopee-affiliate:4000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

export class BackendError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Every call into playwright-service's /admin/* API needs both the shared
// x-api-key (held only here, server-side - the browser never sees it) and
// the signed-in member's JWT (read from the httpOnly cookie set by
// /api/user/login*). The backend answers 403 when that member is not an
// admin; lib/clientApi.ts turns that into a readable message.
export async function backendFetch(path: string, init: RequestInit = {}) {
  const jar = await cookies();
  const token = jar.get(USER_TOKEN_COOKIE_NAME)?.value;

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

function errorResponse(err: unknown) {
  if (err instanceof BackendError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "unexpected error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function proxyGet(path: string) {
  try {
    return NextResponse.json(await backendFetch(path));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function proxyMutate(path: string, method: string, body?: unknown) {
  try {
    return NextResponse.json(
      await backendFetch(path, { method, body: body !== undefined ? JSON.stringify(body) : undefined })
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// Forwards a raw file upload to playwright-service. Separate from
// backendFetch since that helper always JSON-encodes the body - the backend
// expects the file's raw bytes here instead (see /admin/shopping-products/import).
export async function proxyUpload(path: string, buffer: Buffer, fileName?: string) {
  try {
    const jar = await cookies();
    const token = jar.get(USER_TOKEN_COOKIE_NAME)?.value;

    const headers = new Headers();
    headers.set("x-api-key", BACKEND_API_KEY);
    headers.set("content-type", "application/octet-stream");
    if (fileName) headers.set("x-file-name", encodeURIComponent(fileName));
    if (token) headers.set("authorization", `Bearer ${token}`);

    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers,
      body: new Uint8Array(buffer),
      cache: "no-store",
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new BackendError(res.status, (data && data.error) || `backend error ${res.status}`);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
