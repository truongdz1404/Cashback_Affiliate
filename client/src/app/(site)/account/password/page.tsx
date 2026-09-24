import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/appApi";
import { PageHeading, SectionCard, StatusPill } from "@/components/account/ui";
import PasswordForm from "@/components/account/PasswordForm";
import { LockIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Cập nhật mật khẩu | Rewally" };

export default async function PasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/password");

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Cập nhật mật khẩu"
        description={
          user.hasPassword
            ? "Đổi mật khẩu định kỳ để bảo vệ số dư hoàn tiền của bạn."
            : "Tạo mật khẩu để đăng nhập bằng số điện thoại hoặc email, ngoài Google/Facebook."
        }
      />

      <SectionCard
        title={user.hasPassword ? "Đổi mật khẩu" : "Tạo mật khẩu"}
        action={<StatusPill label={user.hasPassword ? "Đã có mật khẩu" : "Chưa tạo"} tone={user.hasPassword ? "success" : "warning"} />}
      >
        <div className="sm:max-w-md">
          <PasswordForm hasPassword={user.hasPassword} />
        </div>
      </SectionCard>

      <div className="flex gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        <LockIcon className="h-5 w-5 shrink-0 text-[var(--accent-dark)]" />
        <p className="leading-relaxed">
          Mật khẩu cần ít nhất 6 ký tự. Rewally không bao giờ hỏi mật khẩu của bạn qua tin nhắn hay cuộc gọi.
        </p>
      </div>
    </div>
  );
}
