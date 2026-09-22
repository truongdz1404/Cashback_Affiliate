"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { appClient, AppRequestError } from "@/lib/appClient";
import type { AppUser } from "@/lib/appTypes";
import { maskPhone } from "@/lib/format";
import TextField from "@/components/public/TextField";
import EmailChangeDialog from "@/components/account/EmailChangeDialog";
import { MailIcon, PhoneIcon, UsersIcon } from "@/components/icons";

// Personal details. Only fullName is writable straight through PUT /app/me -
// phone is the login identifier (read-only here, same as the app's profile
// screen) and email goes through the OTP dialog.
export default function ProfileForm({ user }: { user: AppUser }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [saving, setSaving] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const dirty = fullName.trim() !== (user.fullName ?? "").trim();

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || saving) return;

    setSaving(true);
    try {
      await appClient.put("/me", { fullName: fullName.trim() });
      toast.success("Đã lưu", { description: "Thông tin cá nhân đã được cập nhật." });
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

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={saveName} className="flex flex-col gap-3">
        <TextField
          label="Tên"
          value={fullName}
          onChange={setFullName}
          placeholder="Nhập tên của bạn"
          autoComplete="name"
          icon={UsersIcon}
          disabled={saving}
        />
        <div>
          <button
            type="submit"
            disabled={!dirty || saving}
            className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105 disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </form>

      <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        <div className="flex items-center gap-3 py-3.5">
          <PhoneIcon className="h-4.5 w-4.5 shrink-0 text-[var(--muted)]" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Số điện thoại</p>
            <p className="mt-0.5 text-sm font-bold text-[var(--foreground)]">
              {user.phone ? maskPhone(user.phone) : "Chưa có"}
            </p>
          </div>
          <span className="shrink-0 text-xs text-[var(--muted)]">Không thể đổi</span>
        </div>

        <div className="flex items-center gap-3 py-3.5">
          <MailIcon className="h-4.5 w-4.5 shrink-0 text-[var(--muted)]" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Email</p>
            <p className="mt-0.5 truncate text-sm font-bold text-[var(--foreground)]">
              {user.email || "Thiết lập ngay"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEmailOpen(true)}
            className="shrink-0 rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-bold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {user.email ? "Sửa email" : "Thêm email"}
          </button>
        </div>
      </div>

      <p className="text-xs text-[var(--muted)]">
        Số điện thoại là tài khoản đăng nhập của bạn nên không tự đổi được. Nếu cần thay đổi, vui lòng liên hệ hỗ
        trợ.
      </p>

      <EmailChangeDialog open={emailOpen} currentEmail={user.email} onClose={() => setEmailOpen(false)} />
    </div>
  );
}
