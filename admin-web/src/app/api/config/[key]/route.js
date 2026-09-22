import { NextResponse } from "next/server";
import { backendFetch, BackendError } from "@/lib/api";
import { setUserSession } from "@/lib/userSession";

// Rotating jwtSecret invalidates every token including the admin's own; the
// backend answers with a freshly signed one for the caller, which has to
// replace the cookie or the very next request would 401.
export async function PUT(req, { params }) {
  const { key } = await params;
  const body = await req.json();
  try {
    const data = await backendFetch(`/admin/config/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    const res = NextResponse.json(data);
    return data && data.token ? setUserSession(res, data.token) : res;
  } catch (err) {
    if (err instanceof BackendError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "unexpected error" }, { status: 500 });
  }
}
