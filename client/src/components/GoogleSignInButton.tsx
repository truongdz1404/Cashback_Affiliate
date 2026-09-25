"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOAuthConfig } from "@/lib/useOAuthConfig";

// The window.google GIS global has no first-party types in this project;
// declaring just the shape actually used keeps this file honest about it.
type GoogleAccountsId = {
  initialize: (config: { client_id: string; callback: (resp: { credential: string }) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
};

// Google Identity Services will only start a sign-in from a button it rendered
// itself, and that button cannot be restyled. So the real GIS button is
// rendered on top of ours at full size and made invisible: the visitor sees
// Rewally's pill, the click lands on Google's button.
const GSI_WIDTH = 320;

export default function GoogleSignInButton({
  loginEndpoint,
  referralCode,
  onSuccess,
}: {
  loginEndpoint: string;
  /** Sent along so a first-ever Google sign-in can be credited to whoever invited them. */
  referralCode?: string;
  onSuccess: (data: unknown) => void;
}) {
  const oauth = useOAuthConfig();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gsiReady, setGsiReady] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  const google = oauth.status === "ready" ? oauth.config.google : null;
  const clientId = google && google.enabled ? google.clientId : null;

  const handleCredential = useCallback(
    async (response: { credential: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(loginEndpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken: response.credential, referralCode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Đăng nhập thất bại");
        onSuccess(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
        setLoading(false);
      }
    },
    [loginEndpoint, referralCode, onSuccess],
  );

  const initGsi = useCallback(() => {
    if (initialized.current || !clientId || !buttonRef.current) return;
    const gis = (window as unknown as { google?: { accounts: { id: GoogleAccountsId } } }).google;
    if (!gis) return;

    initialized.current = true;
    gis.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
    gis.accounts.id.renderButton(buttonRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "pill",
      width: GSI_WIDTH,
      text: "continue_with",
      locale: "vi",
    });
    setGsiReady(true);
  }, [clientId, handleCredential]);

  useEffect(() => {
    initGsi();
  }, [initGsi]);

  // The operator turned Google login off - nothing to offer here.
  if (oauth.status === "ready" && !google?.enabled) return null;

  const disabledReason =
    oauth.status === "loading"
      ? "Đang tải…"
      : oauth.status === "unavailable"
        ? "Không kết nối được máy chủ. Vui lòng thử lại sau."
        : !gsiReady
          ? "Đang tải…"
          : null;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {clientId && (
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initGsi} />
      )}

      <div className="relative w-full" style={{ maxWidth: GSI_WIDTH }}>
        <div
          aria-hidden
          className={`flex h-[46px] w-full items-center justify-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] text-sm font-semibold text-[var(--foreground)] transition ${
            disabledReason || loading ? "opacity-60" : "hover:border-[var(--accent)]"
          }`}
        >
          <GoogleLogo />
          {loading ? "Đang đăng nhập…" : "Tiếp tục với Google"}
        </div>

        {/* Google's own button, invisible but clickable, exactly covering ours. */}
        <div
          ref={buttonRef}
          className={`absolute inset-0 overflow-hidden opacity-0 ${
            gsiReady && !loading ? "" : "pointer-events-none"
          }`}
        />
      </div>

      {disabledReason && oauth.status === "unavailable" && (
        <p className="text-center text-xs text-[var(--muted)]">{disabledReason}</p>
      )}
      {error && <p className="text-center text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}

// Google's official four-colour mark, required by their branding guidelines
// whenever a custom button starts a Google sign-in.
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="h-5 w-5 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  );
}
