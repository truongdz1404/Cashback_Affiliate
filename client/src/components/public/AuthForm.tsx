"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TextField from "@/components/public/TextField";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import FacebookSignInButton from "@/components/FacebookSignInButton";
import { hasSocialLogin, useOAuthConfig } from "@/lib/useOAuthConfig";
import { clearReferralCode, readReferralCode } from "@/lib/referralCode";
import { LockIcon, PhoneIcon, UserPlusIcon } from "@/components/icons";

// `next` comes from the URL (?next=/account/wallet, set by proxy.js when it
// bounces a protected route). Only same-origin paths are honoured so a
// crafted link cannot turn a successful login into an open redirect.
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}

export default function AuthForm({
  mode,
  next,
  referralCode,
  embedded = false,
  onSuccess,
  onSwitchMode,
}: {
  mode: "login" | "register";
  next?: string;
  referralCode?: string;
  /** Inside the sign-in dialog: tighter spacing, smaller heading. */
  embedded?: boolean;
  /** When given, a successful sign-in calls this instead of navigating to `next`. */
  onSuccess?: () => void;
  /** When given, "Chưa có tài khoản?" switches mode in place instead of linking to the other page. */
  onSwitchMode?: (mode: "login" | "register") => void;
}) {
  const isRegister = mode === "register";

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [referral, setReferral] = useState(referralCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // An invite link may have been opened days ago, on a completely different
  // page - see lib/referralCode.ts. Read after mount, never during render: on
  // the server there is no localStorage to read.
  const [savedReferral, setSavedReferral] = useState<string | null>(null);
  useEffect(() => setSavedReferral(readReferralCode()), []);

  // Only fills an empty box, so a code in today's URL and anything typed by
  // hand both still win.
  useEffect(() => {
    if (!savedReferral) return;
    setReferral((current) => current || savedReferral);
  }, [savedReferral]);

  // Google and Facebook create the account server-side, with no form to carry
  // the code - so it is sent alongside the token. Also from the login screen:
  // signing in with a provider for the first time IS the sign-up, and that is
  // exactly the moment the referral has to be counted. The backend ignores it
  // for anyone who already has an account.
  const socialReferralCode = (isRegister ? referral.trim() : "") || referralCode || savedReferral || undefined;

  // Don't draw a "Hoặc" divider over an empty space when the operator has
  // switched every social provider off.
  const showSocial = hasSocialLogin(useOAuthConfig());

  function done() {
    // Signed in, one way or another: the saved code has either been spent or
    // was never going to be. Either way it must not sit there waiting to
    // attach itself to the next account created in this browser.
    clearReferralCode();

    // The dialog refreshes the router itself and keeps the visitor on the page.
    if (onSuccess) {
      onSuccess();
      return;
    }
    // A full navigation, not router.push: the session cookie was just set by
    // the API route and every server component must re-render with it.
    window.location.href = safeNext(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedPhone = phone.trim();
    if (!trimmedPhone || !password) {
      setError("Vui lòng nhập số điện thoại và mật khẩu.");
      return;
    }
    if (isRegister) {
      if (password.length < 6) {
        setError("Mật khẩu phải có ít nhất 6 ký tự.");
        return;
      }
      if (password !== confirm) {
        setError("Mật khẩu nhập lại không khớp.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(isRegister ? "/api/user/register" : "/api/user/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isRegister
            ? { phone: trimmedPhone, password, referralCode: referral.trim() || undefined }
            : { phone: trimmedPhone, password },
        ),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(translate(data?.error));
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại.");
      setSubmitting(false);
    }
  }

  const Heading = embedded ? "h2" : "h1";

  return (
    <div>
      <Heading className={`font-extrabold text-[var(--foreground)] ${embedded ? "text-xl" : "text-2xl"}`}>
        {isRegister ? "Tạo tài khoản Rewally" : "Chào mừng trở lại"}
      </Heading>
      <p className="mt-1.5 text-sm text-[var(--muted)]">
        {isRegister
          ? "Đăng ký miễn phí để bắt đầu nhận hoàn tiền cho mọi đơn hàng."
          : "Đăng nhập để xem ví hoàn tiền, đơn hàng và tạo link của bạn."}
      </p>

      <form onSubmit={submit} className={`flex flex-col ${embedded ? "mt-5 gap-3.5" : "mt-7 gap-4"}`}>
        <TextField
          label="Số điện thoại"
          value={phone}
          onChange={setPhone}
          type="tel"
          inputMode="tel"
          placeholder="0901234567"
          autoComplete="tel"
          icon={PhoneIcon}
          required
          disabled={submitting}
        />

        <TextField
          label="Mật khẩu"
          value={password}
          onChange={setPassword}
          type="password"
          placeholder={isRegister ? "Tối thiểu 6 ký tự" : "Nhập mật khẩu"}
          autoComplete={isRegister ? "new-password" : "current-password"}
          icon={LockIcon}
          required
          disabled={submitting}
        />

        {isRegister && (
          <>
            <TextField
              label="Nhập lại mật khẩu"
              value={confirm}
              onChange={setConfirm}
              type="password"
              autoComplete="new-password"
              icon={LockIcon}
              required
              disabled={submitting}
            />
            <TextField
              label="Mã giới thiệu"
              value={referral}
              onChange={setReferral}
              placeholder="Không bắt buộc"
              icon={UserPlusIcon}
              hint="Nếu bạn mở link mời của bạn bè, mã đã được điền sẵn. Cả hai bên cùng có lợi."
              disabled={submitting}
            />
          </>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-[var(--danger)]/10 px-4 py-3 text-sm font-semibold text-[var(--danger)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 rounded-full bg-[var(--accent)] py-3.5 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105 disabled:opacity-60"
        >
          {submitting ? "Đang xử lý…" : isRegister ? "Đăng ký" : "Đăng nhập"}
        </button>
      </form>

      {showSocial && (
        <>
          <div className={`flex items-center gap-3 ${embedded ? "my-5" : "my-7"}`}>
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Hoặc</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="flex flex-col items-center gap-3">
            <GoogleSignInButton loginEndpoint="/api/user/login/google" referralCode={socialReferralCode} onSuccess={done} />
            <FacebookSignInButton loginEndpoint="/api/user/login/facebook" referralCode={socialReferralCode} onSuccess={done} />
          </div>
        </>
      )}

      <p className={`text-center text-sm text-[var(--muted)] ${embedded ? "mt-5" : "mt-8"}`}>
        {isRegister ? "Đã có tài khoản? " : "Chưa có tài khoản? "}
        {onSwitchMode ? (
          <button
            type="button"
            onClick={() => onSwitchMode(isRegister ? "login" : "register")}
            className="font-extrabold text-[var(--accent)] hover:underline"
          >
            {isRegister ? "Đăng nhập" : "Đăng ký miễn phí"}
          </button>
        ) : (
          <Link
            href={isRegister ? `/login${next ? `?next=${encodeURIComponent(next)}` : ""}` : `/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-extrabold text-[var(--accent)] hover:underline"
          >
            {isRegister ? "Đăng nhập" : "Đăng ký miễn phí"}
          </Link>
        )}
      </p>

      {isRegister && (
        <p className={`text-center text-xs leading-relaxed text-[var(--muted)] ${embedded ? "mt-3" : "mt-4"}`}>
          Khi đăng ký, bạn đồng ý với{" "}
          <a href="/app/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline">
            Chính sách quyền riêng tư
          </a>{" "}
          của Rewally.
        </p>
      )}
    </div>
  );
}

// The backend answers in English; these are the cases a visitor can actually
// hit from this form.
function translate(message: unknown): string {
  const text = typeof message === "string" ? message : "";
  switch (text) {
    case "invalid phone or password":
      return "Số điện thoại hoặc mật khẩu không đúng.";
    case "phone already registered":
      return "Số điện thoại này đã được đăng ký. Hãy đăng nhập.";
    case "invalid referral code":
      return "Mã giới thiệu không hợp lệ.";
    case "password must be at least 6 characters":
      return "Mật khẩu phải có ít nhất 6 ký tự.";
    case "phone and password are required":
      return "Vui lòng nhập số điện thoại và mật khẩu.";
    default:
      return text || "Có lỗi xảy ra, vui lòng thử lại.";
  }
}
