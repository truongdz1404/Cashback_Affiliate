"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { appClient, AppRequestError } from "@/lib/appClient";
import type { AppUser } from "@/lib/appTypes";
import { maskPhone } from "@/lib/format";
import EmailChangeDialog from "@/components/account/EmailChangeDialog";
import { CheckIcon, InfoIcon } from "@/components/icons";

type Fact = { label: string; value: string };

// The "Thông tin tài khoản" panel. Only fullName is writable straight through
// PUT /app/me - phone is the login identifier (read-only here, same as the
// app's profile screen) and email goes through the OTP dialog. Everything else
// is read-only account data passed in as `facts`.
export default function ProfileForm({ user, facts }: { user: AppUser; facts: Fact[] }) {
  const router = useRouter();
  const nameId = useId();
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [saving, setSaving] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const trimmed = fullName.trim();
  const dirty = trimmed !== (user.fullName ?? "").trim();
  const canSave = dirty && trimmed.length > 0 && !saving;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;

    setSaving(true);
    try {
      await appClient.put("/me", { fullName: trimmed });
      toast.success("Đã cập nhật", { description: "Thông tin tài khoản đã được lưu." });
      router.refresh();
    } catch (err) {
      if (!(err instanceof AppRequestError) || err.status !== 401) {
        toast.danger("Không lưu được", {
          description: err instanceof AppRequestError ? err.message : "Vui lòng thử lại.",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  const hasPhone = Boolean(user.phone);
  const hasEmail = Boolean(user.email);
  const secure = hasPhone && hasEmail && user.hasPassword;

  return (
    <div className="flex flex-col gap-6">
      {/* Security checklist, like the grey box on ShopBack's account page but
          only with the things this backend can actually verify. */}
      <div className="rounded-2xl bg-[var(--background)] p-4 sm:p-5">
        <p className="text-sm font-extrabold text-[var(--foreground)]">
          {secure ? "Tài khoản của bạn đã được bảo vệ đầy đủ." : "Giữ an toàn cho tài khoản của bạn bằng cách hoàn tất:"}
        </p>
        <ul className="mt-3 flex flex-col gap-2.5">
          <CheckItem done={hasPhone} label="Số điện thoại đăng nhập" doneLabel="Đã xác thực" todoLabel="Chưa có" />
          <CheckItem
            done={hasEmail}
            label="Địa chỉ email"
            doneLabel="Đã xác minh"
            todoLabel="Chưa thêm"
            action={
              !hasEmail && (
                <button
                  type="button"
                  onClick={() => setEmailOpen(true)}
                  className="inline-flex h-8 items-center rounded-full bg-[var(--accent)] px-3.5 text-xs font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105"
                >
                  Thêm email
                </button>
              )
            }
          />
          <CheckItem
            done={user.hasPassword}
            label="Mật khẩu đăng nhập"
            doneLabel="Đã tạo"
            todoLabel="Chưa tạo"
            action={
              !user.hasPassword && (
                <Link
                  href="/account/password"
                  className="inline-flex h-8 items-center rounded-full bg-[var(--accent)] px-3.5 text-xs font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105"
                >
                  Tạo mật khẩu
                </Link>
              )
            }
          />
        </ul>
      </div>

      <form onSubmit={save} className="flex flex-col">
        <div className="divide-y divide-[var(--border)]">
          <Row label="Tên đầy đủ" required htmlFor={nameId}>
            <input
              id={nameId}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tên hiển thị của bạn"
              autoComplete="name"
              maxLength={80}
              disabled={saving}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--field-background)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] disabled:opacity-60 sm:max-w-md"
            />
          </Row>

          <Row label="Email">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="break-all text-sm font-semibold text-[var(--foreground)]">
                {user.email || <span className="font-medium text-[var(--muted)]">Chưa thêm email</span>}
              </span>
              <button
                type="button"
                onClick={() => setEmailOpen(true)}
                className="text-sm font-bold text-[var(--accent-dark)] underline-offset-4 hover:underline"
              >
                {user.email ? "Chỉnh sửa địa chỉ email" : "Thêm email"}
              </button>
            </div>
          </Row>

          <Row label="Số điện thoại">
            {user.phone ? (
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {maskPhone(user.phone)}{" "}
                <span className="font-medium text-[var(--success)]">(Đã xác thực)</span>
              </p>
            ) : (
              <p className="text-sm font-medium text-[var(--muted)]">
                Chưa có. Tài khoản này đăng nhập bằng {user.googleLinked ? "Google" : user.facebookLinked ? "Facebook" : "email"}.
              </p>
            )}
          </Row>

          {facts.map((fact) => (
            <Row key={fact.label} label={fact.label}>
              <p className="text-sm font-semibold text-[var(--foreground)]">{fact.value}</p>
            </Row>
          ))}
        </div>

        <div className="mt-5 flex flex-col items-center gap-3">
          <button
            type="submit"
            disabled={!canSave}
            className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-full bg-[var(--foreground)] px-8 text-sm font-extrabold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Đang lưu…" : "Cập nhật thông tin"}
          </button>
          <p className="text-center text-xs text-[var(--muted)]">
            Số điện thoại là tài khoản đăng nhập nên chưa tự đổi được trên web.
          </p>
        </div>
      </form>

      <EmailChangeDialog open={emailOpen} currentEmail={user.email} onClose={() => setEmailOpen(false)} />
    </div>
  );
}

function CheckItem({
  done,
  label,
  doneLabel,
  todoLabel,
  action,
}: {
  done: boolean;
  label: string;
  doneLabel: string;
  todoLabel: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          done ? "bg-[var(--success)] text-white" : "bg-[var(--warning)] text-[#4A3600]"
        }`}
      >
        {done ? <CheckIcon className="h-3.5 w-3.5" /> : <InfoIcon className="h-3.5 w-3.5" />}
      </span>
      {/* Label and status stack on phones; side by side once there is room. */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm font-semibold text-[var(--foreground)] sm:flex-row sm:items-center sm:gap-2">
        <span>{label}</span>
        <span className={`text-xs font-bold ${done ? "text-[var(--success)]" : "text-[#9A6B00]"}`}>
          {done ? doneLabel : todoLabel}
        </span>
      </span>
      {action && <span className="shrink-0">{action}</span>}
    </li>
  );
}

// Label on the left, value on the right, stacked on phones.
function Row({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const Tag = htmlFor ? "label" : "p";
  return (
    <div className="grid gap-1.5 py-4 first:pt-0 last:pb-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center sm:gap-6">
      <Tag htmlFor={htmlFor} className="text-sm font-bold text-[var(--muted)] sm:text-[var(--foreground)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--danger)]">*</span>}
      </Tag>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
