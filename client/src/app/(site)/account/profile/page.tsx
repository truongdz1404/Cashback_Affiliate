import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/appApi";
import { formatDate, formatPct } from "@/lib/format";
import { PageHeading, SectionCard, StatusPill } from "@/components/account/ui";
import ProfileForm from "@/components/account/ProfileForm";

export const metadata: Metadata = { title: "Thông tin tài khoản | Rewally" };

export default async function ProfilePage() {
  const user = await getSessionUser();

  // The layout above already redirects, but TypeScript can't know that and a
  // session can expire between the two fetches.
  if (!user) redirect("/login?next=/account/profile");

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Thông tin tài khoản" description="Thông tin cá nhân và các cách đăng nhập của bạn." />

      <SectionCard>
        <ProfileForm
          user={user}
          facts={[
            { label: "Mã thành viên", value: `#${user.id}` },
            { label: "Ngày tham gia", value: formatDate(user.createdAt) },
            { label: "Mã giới thiệu", value: user.referralCode ?? "—" },
            {
              label: "Tỷ lệ hoàn tiền",
              value: user.commissionPct != null ? formatPct(user.commissionPct) : "Theo mặc định hệ thống",
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="Tài khoản liên kết">
        <ul className="divide-y divide-[var(--border)]">
          <LinkedRow label="Google" badge="G" badgeClass="bg-[#EA4335] text-white" linked={Boolean(user.googleId)} />
          <LinkedRow label="Facebook" badge="f" badgeClass="bg-[#1877F2] text-white" linked={Boolean(user.facebookId)} />
        </ul>
        <p className="mt-4 text-xs text-[var(--muted)]">
          Liên kết được tạo tự động khi bạn đăng nhập bằng Google hoặc Facebook với cùng email.
        </p>
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
