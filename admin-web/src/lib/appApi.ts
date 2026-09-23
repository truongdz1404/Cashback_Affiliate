// Server-only: reads the httpOnly user_token cookie and talks to the backend
// over the internal docker network. Never import this from a "use client"
// module - use @/lib/appClient, which goes through /api/user/*.
import { cache } from "react";
import { cookies } from "next/headers";
import { BackendError, USER_TOKEN_COOKIE_NAME } from "@/lib/api";
import type { AppUser } from "@/lib/appTypes";

const BACKEND_URL = process.env.BACKEND_URL || "http://shopee-affiliate:4000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

export async function getUserToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(USER_TOKEN_COOKIE_NAME)?.value ?? null;
}

// Calls playwright-service's /app/* API as the visitor. The user_token cookie
// is attached when present; without it the content routes (banners,
// campaigns, shopping-products, recommendations) still answer, just without
// personalization - see appAuth.optionalAppUser on the backend.
export async function appFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getUserToken();

  const headers = new Headers(init.headers);
  headers.set("x-api-key", BACKEND_API_KEY);
  if (init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const res = await fetch(`${BACKEND_URL}/app${path}`, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) throw new BackendError(res.status, (data && data.error) || `backend error ${res.status}`);
  return data as T;
}

// Public pages must still render when the backend is unreachable or a
// section has no rows yet - a cashback site with an empty catalog is a thin
// page, not a 500. Sections decide for themselves what to do with a fallback.
export async function appFetchSafe<T>(path: string, fallback: T): Promise<T> {
  try {
    return await appFetch<T>(path);
  } catch {
    return fallback;
  }
}

// Deduped per request: the header, the account nav and the page body all ask
// "who is this?" and must not each hit the backend.
export const getSessionUser = cache(async (): Promise<AppUser | null> => {
  if (!(await getUserToken())) return null;
  try {
    return await appFetch<AppUser>("/me");
  } catch {
    // Expired/rotated token - treat as logged out rather than erroring the
    // whole page; proxy.js will bounce protected routes to /login anyway.
    return null;
  }
});

// The same remote switch the mobile app reads, so one flip in the dashboard
// turns the shop surfaces on or off everywhere instead of only in the app.
// Deduped per request like getSessionUser: the home rail, the search shortcut
// and the shop page all ask, and must not each hit the backend.
//
// Defaults to off, matching the app's own DEFAULTS: if /config cannot be read
// we would rather show no shop UI than rails that quietly fail to load.
export const getAppFeatures = cache(async (): Promise<{ shops: boolean }> => {
  const payload = await appFetchSafe<{ config?: { features?: { shops?: boolean } } }>("/config", {});
  return { shops: payload.config?.features?.shops === true };
});

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
