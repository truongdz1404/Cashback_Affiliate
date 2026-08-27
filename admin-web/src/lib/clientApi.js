"use client";

// Thin wrapper around the local /api/* routes (which proxy to
// playwright-service's /admin/* API). A 401 here means the admin session
// expired or was invalidated (e.g. the JWT secret was rotated) - send the
// user back to /login instead of showing a broken page.
async function request(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options && options.headers) },
  });

  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("unauthorized");
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data && data.error) || `request failed: ${res.status}`);
  }
  return data;
}

export const clientApi = {
  get: (path) => request(path),
  put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) }),
  post: (path, body) => request(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
};
