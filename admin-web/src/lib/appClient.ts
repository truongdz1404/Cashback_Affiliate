"use client";

import { openAuthDialog } from "@/lib/authDialog";

// Client-side counterpart of lib/appApi.ts: talks to the local /api/user/*
// proxy, which attaches the httpOnly user_token. A 401 means the session
// expired - open the sign-in dialog over the current page (the dashboard's
// lib/clientApi.ts instead clears the cookie and sends people to /login).
export class AppRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/user${path}`, {
      ...options,
      headers: { "content-type": "application/json", ...(options && options.headers) },
    });
  } catch {
    throw new AppRequestError(0, "Không thể kết nối máy chủ, kiểm tra lại mạng.");
  }

  if (res.status === 401) {
    openAuthDialog({
      title: "Phiên đăng nhập đã hết hạn",
      description: "Đăng nhập lại để tiếp tục, bạn vẫn ở nguyên trang này.",
    });
    throw new AppRequestError(401, "Phiên đăng nhập đã hết hạn.");
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new AppRequestError(res.status, (data && data.error) || `Yêu cầu thất bại (HTTP ${res.status})`);
  }
  return data as T;
}

export const appClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
};

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
