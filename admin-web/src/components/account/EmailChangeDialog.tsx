"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { appClient, AppRequestError } from "@/lib/appClient";
import TextField from "@/components/public/TextField";
import Modal from "@/components/account/Modal";
import { MailIcon } from "@/components/icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// lib/emailOtp.js: RESEND_COOLDOWN_MS. Counting down locally saves the user a
// wasted request that would only come back as "vui long doi Ns".
const RESEND_COOLDOWN_SEC = 60;

// Email is a unique, login-linkable field, so the backend only writes it after
// a 6-digit code proves the visitor controls the address
// (POST /app/me/email/request-otp then /verify-otp).
export default function EmailChangeDialog({
  open,
  currentEmail,
  onClose,
}: {
  open: boolean;
  currentEmail: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep("email");
    setEmail(currentEmail ?? "");
    setOtp("");
    setCooldown(0);
  }, [open, currentEmail]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function requestOtp() {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      toast.danger("Email không hợp lệ", { description: "Vui lòng kiểm tra lại email." });
      return;
    }
    if (busy) return;

    setBusy(true);
    try {
      await appClient.post("/me/email/request-otp", { email: value });
      setEmail(value);
      setStep("otp");
      setOtp("");
      setCooldown(RESEND_COOLDOWN_SEC);
      toast.info("Đã gửi mã xác thực", { description: `Mã xác thực đã được gửi tới ${value}.` });
    } catch (err) {
      report(err, "Không gửi được mã");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    const code = otp.trim();
    if (code.length !== 6 || busy) return;

    setBusy(true);
    try {
      await appClient.post("/me/email/verify-otp", { email: email.trim().toLowerCase(), otp: code });
      toast.success("Thành công", { description: "Email đã được cập nhật." });
      onClose();
      router.refresh();
    } catch (err) {
      report(err, "Không xác thực được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={step === "email" ? "Sửa email" : "Nhập mã xác thực"}
      description={
        step === "otp"
          ? `Mã xác thực đã được gửi tới ${email}. Mã có hiệu lực trong 10 phút.`
          : "Chúng tôi sẽ gửi mã xác thực 6 số tới email mới để xác nhận đây là email của bạn."
      }
      onClose={onClose}
    >
      {step === "email" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            requestOtp();
          }}
        >
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="email@example.com"
            autoComplete="email"
            inputMode="email"
            icon={MailIcon}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="rounded-full bg-[var(--accent)] py-3 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105 disabled:opacity-50"
          >
            {busy ? "Đang gửi…" : "Gửi mã xác thực"}
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            verifyOtp();
          }}
        >
          <div>
            <label htmlFor="email-otp" className="mb-1.5 block text-sm font-bold text-[var(--foreground)]">
              Mã xác thực
            </label>
            <input
              id="email-otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Nhập mã 6 số"
              inputMode="numeric"
              autoComplete="one-time-code"
              disabled={busy}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--field-background)] px-4 py-3 text-center text-lg font-extrabold tracking-[0.5em] text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={busy || otp.length !== 6}
            className="rounded-full bg-[var(--accent)] py-3 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105 disabled:opacity-50"
          >
            {busy ? "Đang xác nhận…" : "Xác nhận"}
          </button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("email")}
              className="text-sm font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              Đổi email khác
            </button>
            <button
              type="button"
              onClick={requestOtp}
              disabled={busy || cooldown > 0}
              className="text-sm font-bold text-[var(--accent)] transition hover:brightness-110 disabled:text-[var(--muted)]"
            >
              {cooldown > 0 ? `Gửi lại mã (${cooldown}s)` : "Gửi lại mã"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function report(err: unknown, title: string) {
  // appClient already redirects on 401; a toast on top of that is noise.
  if (err instanceof AppRequestError && err.status === 401) return;
  const description = err instanceof AppRequestError ? translate(err.message) : "Vui lòng thử lại.";
  toast.danger(title, { description });
}

// lib/emailOtp.js writes its messages without diacritics; rewrite them rather
// than showing a Vietnamese user unaccented text.
function translate(message: string): string {
  const wait = /^vui long doi (\d+)s truoc khi gui lai ma$/.exec(message);
  if (wait) return `Vui lòng đợi ${wait[1]}s trước khi gửi lại mã.`;

  switch (message) {
    case "ma xac thuc khong dung":
      return "Mã xác thực không đúng.";
    case "ma da het han - vui long gui lai ma":
      return "Mã đã hết hạn, vui lòng gửi lại mã.";
    case "sai qua nhieu lan - vui long gui lai ma":
      return "Bạn nhập sai quá nhiều lần, vui lòng gửi lại mã.";
    case "khong co yeu cau xac thuc nao dang cho - vui long gui lai ma":
      return "Không có yêu cầu xác thực nào đang chờ, vui lòng gửi lại mã.";
    case "body.email is invalid":
      return "Email không hợp lệ.";
    case "this is already your current email":
      return "Đây đã là email hiện tại của bạn.";
    case "email already in use":
      return "Email này đã được dùng cho một tài khoản khác.";
    default:
      return message || "Vui lòng thử lại.";
  }
}
