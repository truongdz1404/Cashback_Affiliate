import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appFetchSafe, getSessionUser } from "@/lib/appApi";
import type { Bank } from "@/lib/appTypes";
import { formatDate, formatPct } from "@/lib/format";
import { SectionCard, StatusPill } from "@/components/account/ui";
import ProfileForm from "@/components/account/ProfileForm";
import BankAccountForm from "@/components/account/BankAccountForm";
import PasswordForm from "@/components/account/PasswordForm";

export const metadata: Metadata = { title: "Tài khoản | Rewally" };

export default async function ProfilePage() {
  const [user, banks] = await Promise.all([
    getSessionUser(),
    appFetchSafe<Bank[]>("/banks", []),
  ]);

  // The layout above already redirects, but TypeScript can't know that and a
  // session can expire between the two fetches.
  if (!user) redirect("/login?next=/account/profile");

  const missingBank = !user.bankName || !user.bankAccountNumber || !user.bankAccountHolder;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-extrabold text-[var(--foreground)]">Tài khoản</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Thông tin cá nhân, tài khoản nhận tiền và bảo mật đăng nhập.
        </p>
      </div>

      <SectionCard title="Hồ sơ">
        <ProfileForm user={user} />
      </SectionCard>

      <SectionCard
        title="Tài khoản ngân hàng"
        action={
          <StatusPill
            label={missingBank ? "Chưa thiết lập" : "Đã thiết lập"}
            tone={missingBank ? "warning" : "success"}
          />
        }
      >
        {missingBank && (
          <p className="mb-4 rounded-xl bg-[var(--warning)]/12 px-3.5 py-3 text-sm font-semibold text-[#9A6B00]">
            Bạn cần cập nhật thông tin ngân hàng trước khi thanh toán.
          </p>
        )}
        <BankAccountForm user={user} banks={banks} />
      </SectionCard>

      <SectionCard title={user.hasPassword ? "Đổi mật khẩu" : "Tạo mật khẩu"}>
        <PasswordForm hasPassword={user.hasPassword} />
      </SectionCard>

      <SectionCard title="Tài khoản liên kết">
        <ul className="divide-y divide-[var(--border)]">
          <LinkedRow label="Google" badge="G" badgeClass="bg-[#EA4335] text-white" linked={Boolean(user.googleId)} />
          <LinkedRow label="Facebook" badge="f" badgeClass="bg-[#1877F2] text-white" linked={Boolean(user.facebookId)} />
        </ul>
        <p className="mt-4 text-xs text-[var(--muted)]">
          Liên kết được tạo tự động khi bạn đăng nhập bằng Google hoặc Facebook.
        </p>
      </SectionCard>

      <SectionCard title="Thông tin tài khoản">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <InfoRow label="Mã cộng tác viên" value={`#${user.id}`} />
          <InfoRow label="Ngày tham gia" value={formatDate(user.createdAt)} />
          <InfoRow label="Mã giới thiệu" value={user.referralCode ?? "-"} />
          <InfoRow
            label="Tỷ lệ hoàn tiền của bạn"
            value={user.commissionPct != null ? formatPct(user.commissionPct) : "Theo mặc định hệ thống"}
          />
        </dl>
      </SectionCard>
    </div>
  );
}

function LinkedRow({
  label,
  badge,
  badgeClass,
  linked,
}: {
  label: string;
  badge: string;
  badgeClass: string;
  linked: boolean;
}) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${badgeClass}`}
      >
        {badge}
      </span>
      <span className="min-w-0 flex-1 text-sm font-bold text-[var(--foreground)]">{label}</span>
      <StatusPill label={linked ? "Đã liên kết" : "Chưa liên kết"} tone={linked ? "success" : "neutral"} />
    </li>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3 last:border-0 sm:last:border-b sm:[&:nth-last-child(-n+2)]:border-0">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="text-sm font-bold text-[var(--foreground)]">{value}</dd>
    </div>
  );
}
