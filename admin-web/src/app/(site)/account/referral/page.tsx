import type { Metadata } from "next";
import { appFetchSafe } from "@/lib/appApi";
import type { ReferralInvitee, ReferralView } from "@/lib/appTypes";
import { formatDate, formatVnd, maskPhone } from "@/lib/format";
import { PageHeading, SectionCard, StatTile, StatusPill, EmptyState } from "@/components/account/ui";
import type { PillTone } from "@/components/account/ui";
import ReferralShare from "@/components/account/ReferralShare";
import { UsersIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Giới thiệu bạn bè | Rewally" };

const STATUS_LABEL: Record<ReferralInvitee["status"], string> = {
  pending: "Chờ hoàn tất",
  qualified: "Đã đủ điều kiện",
  rewarded: "Đã nhận thưởng",
};

const STATUS_TONE: Record<ReferralInvitee["status"], PillTone> = {
  pending: "neutral",
  qualified: "accent",
  rewarded: "success",
};

export default async function ReferralPage() {
  const referral = await appFetchSafe<ReferralView | null>("/referral?limit=100", null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Giới thiệu bạn bè & nhận thưởng"
        description="Bạn bè đăng ký bằng mã của bạn và hoàn tất đơn đầu tiên, cả hai cùng nhận thưởng."
      />

      <SectionCard>
        <ReferralShare code={referral?.referralCode ?? "------"} />
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Đã mời" value={String(referral?.stats.totalInvited ?? 0)} />
        <StatTile label="Đủ điều kiện" value={String(referral?.stats.qualified ?? 0)} />
        <StatTile
          label="Tổng thưởng"
          value={formatVnd(referral?.stats.totalReward)}
          tone="accent"
          hint="Đã cộng vào số dư ví của bạn"
        />
      </div>

      <SectionCard title="Danh sách bạn đã mời">
        {!referral || referral.invited.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="Bạn chưa mời ai"
            description="Chia sẻ mã ngay để nhận thưởng!"
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {referral.invited.map((invitee) => (
              <li key={invitee.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  {/* Someone else's phone number - only the last 2 digits are shown. */}
                  <p className="text-sm font-bold text-[var(--foreground)]">{maskPhone(invitee.referredPhone)}</p>
                  <p className="text-xs text-[var(--muted)]">{formatDate(invitee.createdAt)}</p>
                </div>
                {invitee.rewardAmount != null && (
                  <p className="shrink-0 text-sm font-extrabold tabular-nums text-[var(--accent)]">
                    {formatVnd(invitee.rewardAmount)}
                  </p>
                )}
                <StatusPill label={STATUS_LABEL[invitee.status] ?? invitee.status} tone={STATUS_TONE[invitee.status] ?? "neutral"} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
