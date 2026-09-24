"use client";

// Thin wrapper around the local /api/* routes (which proxy to
// the backend's /admin/* API).
//   401 - the session expired or was invalidated (e.g. the JWT secret was
//         rotated): drop the dead cookie and come back here after signing in.
//   403 - signed in, but the account lost its admin role meanwhile; the
//         dashboard is already on screen so a readable error beats a 404.
async function request<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options && options.headers) },
  });

  if (res.status === 401) {
    const back = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    window.location.href = `/api/user/logout?next=${encodeURIComponent(back)}`;
    throw new Error("unauthorized");
  }
  if (res.status === 403) {
    throw new Error("Tài khoản của bạn không còn quyền quản trị.");
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data && data.error) || `request failed: ${res.status}`);
  }
  return data as T;
}

export const clientApi = {
  get: <T = unknown>(path: string) => request<T>(path),
  put: <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
};
