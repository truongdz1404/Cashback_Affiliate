"use client";

import { useEffect, useState } from "react";
import type { OAuthConfig } from "@/lib/appTypes";

export type OAuthConfigState =
  | { status: "loading" }
  // The backend answered: providers are exactly what it says they are.
  | { status: "ready"; config: OAuthConfig }
  // The backend could not be reached. NOT the same as "disabled" - a login
  // page that silently drops its Google button whenever the API hiccups looks
  // broken, so callers show the button disabled with an explanation instead.
  | { status: "unavailable" };

// One fetch per page load, shared by the Google and Facebook buttons (they
// both used to request /api/oauth-config separately). Cached at module level
// so navigating between /login and /register does not refetch.
let cached: OAuthConfigState | null = null;
let inflight: Promise<OAuthConfigState> | null = null;

function load(): Promise<OAuthConfigState> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = fetch("/api/oauth-config")
    .then((r) => r.json())
    .then((data): OAuthConfigState => {
      // The proxy route answers 200 with `unavailable: true` when the backend
      // itself is unreachable.
      if (!data || data.unavailable) return { status: "unavailable" };
      return { status: "ready", config: data as OAuthConfig };
    })
    .catch((): OAuthConfigState => ({ status: "unavailable" }))
    .then((state) => {
      cached = state;
      inflight = null;
      return state;
    });

  return inflight;
}

export function useOAuthConfig(): OAuthConfigState {
  const [state, setState] = useState<OAuthConfigState>(() => cached ?? { status: "loading" });

  useEffect(() => {
    let cancelled = false;
    load().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// True when at least one social provider will render something - used to
// decide whether the "Hoặc" divider above them is worth drawing.
export function hasSocialLogin(state: OAuthConfigState): boolean {
  if (state.status === "loading") return true; // reserve the space, avoid a jump
  if (state.status === "unavailable") return true; // disabled buttons still show
  return state.config.google.enabled || state.config.facebook.enabled;
}
