"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { appClient, AppRequestError } from "@/lib/appClient";
import TextField from "@/components/public/TextField";
import { LockIcon } from "@/components/icons";

const MIN_LENGTH = 6; // server.js: newPassword must be at least 6 characters

// PUT /app/password. An account created through Google/Facebook has no
// password hash yet, and the backend accepts an empty currentPassword in that
// case - so this becomes "create a password" rather than "change" one.
export default function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit =
    newPassword.length >= MIN_LENGTH &&
    confirmPassword === newPassword &&
    (!hasPassword || currentPassword.length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || saving) return;

    setSaving(true);
    try {
      await appClient.put("/password", { currentPassword, newPassword });
      toast.success("Thành công", {
        description: hasPassword ? "Mật khẩu đã được đổi." : "Mật khẩu đã được tạo.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      router.refresh();
    } catch (err) {
      if (!(err instanceof AppRequestError) || err.status !== 401) {
        toast.danger("Không đổi được mật khẩu", {
          description: err instanceof AppRequestError ? translate(err.message) : "Vui lòng thử lại.",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {!hasPassword && (
        <p className="rounded-xl bg-[var(--accent-soft)] px-3.5 py-3 text-sm text-[var(--accent-dark)]">
          Tài khoản của bạn đang đăng nhập bằng Google/Facebook. Tạo thêm mật khẩu để đăng nhập bằng số điện thoại
          hoặc email.
        </p>
      )}

      {hasPassword && (
        <TextField
          label="Mật khẩu hiện tại"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          placeholder="Nhập mật khẩu hiện tại"
          autoComplete="current-password"
          icon={LockIcon}
          disabled={saving}
          required
        />
      )}

      <TextField
        label="Mật khẩu mới"
        type="password"
        value={newPassword}
        onChange={setNewPassword}
        placeholder={`Tối thiểu ${MIN_LENGTH} ký tự`}
        autoComplete="new-password"
        icon={LockIcon}
        hint={tooShort ? `Mật khẩu phải có ít nhất ${MIN_LENGTH} ký tự.` : undefined}
        disabled={saving}
        required
      />

      <TextField
        label="Nhập lại mật khẩu mới"
        type="password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Nhập lại mật khẩu mới"
        autoComplete="new-password"
        icon={LockIcon}
        hint={mismatch ? "Mật khẩu nhập lại không khớp." : undefined}
        disabled={saving}
        required
      />

      <div>
        <button
          type="submit"
          disabled={!canSubmit || saving}
          className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105 disabled:opacity-50"
        >
          {saving ? "Đang lưu…" : hasPassword ? "Đổi mật khẩu" : "Tạo mật khẩu"}
        </button>
      </div>
    </form>
  );
}

function translate(message: string): string {
  switch (message) {
    case "currentPassword is incorrect":
      return "Mật khẩu hiện tại không đúng.";
    case "newPassword must be at least 6 characters":
      return `Mật khẩu mới phải có ít nhất ${MIN_LENGTH} ký tự.`;
    default:
      return message || "Vui lòng thử lại.";
  }
}
