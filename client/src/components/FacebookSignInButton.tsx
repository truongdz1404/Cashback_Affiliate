"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOAuthConfig } from "@/lib/useOAuthConfig";

// Minimal shape of the Facebook JS SDK global actually used here.
type FacebookSdk = {
  init: (options: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void;
  login: (
    callback: (response: { authResponse?: { accessToken?: string } | null; status?: string }) => void,
    options?: { scope: string },
  ) => void;
};

// Graph API version is pinned: an unpinned SDK silently changes behaviour
// when Facebook rolls a new version, and the backend verifies the token
// against its own pinned version anyway (lib/oauthLogin.js).
const GRAPH_VERSION = "v21.0";

export default function FacebookSignInButton({
  loginEndpoint,
  referralCode,
  onSuccess,
}: {
  loginEndpoint: string;
  /** Sent along so a first-ever Facebook sign-in can be credited to whoever invited them. */
  referralCode?: string;
  onSuccess: (data: unknown) => void;
}) {
  const oauth = useOAuthConfig();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const initialized = useRef(false);

  const facebook = oauth.status === "ready" ? oauth.config.facebook : null;
  const appId = facebook && facebook.enabled ? facebook.appId : null;

  const initSdk = useCallback(() => {
    if (initialized.current || !appId) return;
    const FB = (window as unknown as { FB?: FacebookSdk }).FB;
    if (!FB) return;
    initialized.current = true;
    FB.init({ appId, cookie: true, xfbml: false, version: GRAPH_VERSION });
  }, [appId]);

  useEffect(() => {
    initSdk();
  }, [initSdk]);

  function signIn() {
    const FB = (window as unknown as { FB?: FacebookSdk }).FB;
    if (!FB) {
      setError("Chưa tải được Facebook, thử lại sau giây lát.");
      return;
    }
    initSdk();
    setError(null);

    FB.login(
      async (response) => {
        const accessToken = response.authResponse?.accessToken;
        if (!accessToken) {
          // The user closed the popup or declined - not an error worth shouting.
          return;
        }
        setLoading(true);
        try {
          const res = await fetch(loginEndpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ accessToken, referralCode }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "Đăng nhập thất bại");
          onSuccess(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
          setLoading(false);
        }
      },
      { scope: "public_profile,email" },
    );
  }

  // The operator turned Facebook login off - nothing to offer here.
  if (oauth.status === "ready" && !facebook?.enabled) return null;

  const unavailable = oauth.status !== "ready";

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {appId && <Script src="https://connect.facebook.net/vi_VN/sdk.js" strategy="afterInteractive" onLoad={initSdk} />}

      <button
        type="button"
        onClick={signIn}
        disabled={loading || unavailable}
        className="flex h-[46px] w-full max-w-[320px] items-center justify-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[#1877F2] disabled:opacity-60 disabled:hover:border-[var(--border)]"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 shrink-0" fill="#1877F2">
          <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
        </svg>
        {loading ? "Đang đăng nhập…" : "Tiếp tục với Facebook"}
      </button>

      {error && <p className="text-center text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
