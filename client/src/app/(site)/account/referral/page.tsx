import type { Metadata } from "next";
import { appFetchSafe } from "@/lib/appApi";
import type { ReferralInvitee, ReferralProgram, ReferralView } from "@/lib/appTypes";
import { formatDate, formatPct, formatVnd, maskPhone } from "@/lib/format";
import { PageHeading, SectionCard, StatTile, StatusPill, EmptyState } from "@/components/account/ui";
import type { PillTone } from "@/components/account/ui";
import ReferralShare from "@/components/account/ReferralShare";
import { GiftIcon, ReceiptIcon, UsersIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Giới thiệu bạn bè | Rewally" };

const STATUS_LABEL: Record<ReferralInvitee["status"], string> = {
  pending: "Chưa có đơn",
  qualified: "Đã mua hàng",
  rewarded: "Đã mua hàng",
};

const STATUS_TONE: Record<ReferralInvitee["status"], PillTone> = {
  pending: "neutral",
  qualified: "accent",
  rewarded: "success",
};

const EMPTY_PROGRAM: ReferralProgram = { commissionPct: 0, commissionMonths: 0, firstOrderBonus: 0 };

function programTerm(program: ReferralProgram): string {
  return program.commissionMonths > 0 ? `trong ${program.commissionMonths} tháng` : "trọn đời";
}

export default async function ReferralPage() {
  const referral = await appFetchSafe<ReferralView | null>("/referral?limit=100", null);
  const program = referral?.program ?? EMPTY_PROGRAM;
  const stats = referral?.stats;
  const hasCommission = program.commissionPct > 0;
  const hasBonus = program.firstOrderBonus > 0;

  const headline = hasCommission
    ? `Nhận ${formatPct(program.commissionPct)} hoa hồng ${programTerm(program)} trên mỗi đơn hàng bạn bè đặt qua Rewally.`
    : hasBonus
      ? `Nhận ${formatVnd(program.firstOrderBonus)} khi bạn bè hoàn tất đơn hàng đầu tiên.`
      : "Mời bạn bè dùng Rewally bằng mã giới thiệu của bạn.";

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Giới thiệu bạn bè & nhận hoa hồng" description={headline} />

      <SectionCard>
        <ReferralShare code={referral?.referralCode ?? "------"} program={program} />
      </SectionCard>

      {(hasCommission || hasBonus) && (
        <SectionCard title="Cách tính thưởng">
          <ol className="grid gap-3 sm:grid-cols-3">
            <li className="rounded-2xl bg-[var(--surface-secondary)] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Bước 1</p>
              <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">Bạn bè bấm vào link mời của bạn</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Bấm xong là mã của bạn được nhớ sẵn trong 7 ngày. Bạn ấy cứ xem hàng thoải mái, hôm sau quay lại đăng ký
                vẫn được tính cho bạn.
              </p>
            </li>
            <li className="rounded-2xl bg-[var(--surface-secondary)] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Bước 2</p>
              <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">Họ mua sắm Shopee qua Rewally</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Họ vẫn nhận đủ hoàn tiền như mọi người dùng khác, không bị trừ một đồng nào.</p>
            </li>
            <li className="rounded-2xl bg-[var(--accent-soft)] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent-soft-foreground)]">Bước 3</p>
              <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                {hasCommission
                  ? `Bạn nhận ${formatPct(program.commissionPct)} số tiền hoàn của họ`
                  : `Bạn nhận ${formatVnd(program.firstOrderBonus)}`}
              </p>
              <p className="mt-1 text-xs text-[var(--accent-soft-foreground)]">
                {hasCommission
                  ? `Tính trên mỗi đơn hoàn thành, ${programTerm(program)}${hasBonus ? `, cộng thêm ${formatVnd(program.firstOrderBonus)} cho đơn đầu tiên` : ""}. Cộng thẳng vào số dư khả dụng.`
                  : "Cộng vào số dư khả dụng khi đơn đầu tiên của họ hoàn thành."}
              </p>
            </li>
          </ol>

          <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
            Mã được nhớ ngay trên máy của bạn bè, nên đăng ký bằng số điện thoại hay bằng Google, Facebook đều tính như
            nhau. Chỉ có hai trường hợp mã bị quên: quá 7 ngày chưa đăng ký, hoặc bạn ấy mở link ở máy này rồi lại đăng
            ký ở máy khác. Khi đó chỉ cần gõ tay mã của bạn vào ô “Mã giới thiệu” lúc tạo tài khoản là xong.
          </p>
        </SectionCard>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Đã mời" value={String(stats?.totalInvited ?? 0)} />
        <StatTile label="Đã mua hàng" value={String(stats?.qualified ?? 0)} hint={`${stats?.orderCount ?? 0} đơn hoàn thành`} />
        <StatTile label="Hoa hồng tích luỹ" value={formatVnd(stats?.commissionTotal)} tone="accent" hint="Đã cộng vào số dư khả dụng" />
        <StatTile
          label="Tổng thưởng"
          value={formatVnd(stats?.totalReward)}
          hint={stats?.bonusTotal ? `Gồm ${formatVnd(stats.bonusTotal)} thưởng đơn đầu` : "Hoa hồng + thưởng đơn đầu"}
        />
      </div>

      <SectionCard title="Danh sách bạn đã mời">
        {!referral || referral.invited.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="Bạn chưa mời ai"
            description={
              hasCommission
                ? `Chia sẻ mã ngay, mỗi đơn bạn bè đặt là bạn có thêm ${formatPct(program.commissionPct)} hoa hồng.`
                : "Chia sẻ mã ngay để nhận thưởng!"
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {referral.invited.map((invitee) => (
              <li key={invitee.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  {/* Someone else's phone number - only the last 2 digits are shown. */}
                  <p className="text-sm font-bold text-[var(--foreground)]">{maskPhone(invitee.referredPhone)}</p>
                  <p className="text-xs text-[var(--muted)]">
                    Tham gia {formatDate(invitee.createdAt)}
                    {invitee.orderCount > 0 ? ` · ${invitee.orderCount} đơn` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-extrabold tabular-nums text-[var(--accent)]">
                    {formatVnd((invitee.commissionTotal ?? 0) + (invitee.status !== "pending" ? invitee.rewardAmount ?? 0 : 0))}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">bạn nhận</p>
                </div>
                <StatusPill label={STATUS_LABEL[invitee.status] ?? invitee.status} tone={STATUS_TONE[invitee.status] ?? "neutral"} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Hoa hồng gần đây">
        {!referral || referral.commissions.length === 0 ? (
          <EmptyState
            icon={ReceiptIcon}
            title="Chưa có hoa hồng"
            description="Khi bạn bè hoàn thành đơn hàng qua Rewally, từng khoản hoa hồng sẽ hiện ở đây."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {referral.commissions.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)]">
                  <GiftIcon className="h-4 w-4 text-[var(--accent-soft-foreground)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                    {c.productName || `Đơn ${c.orderSn}`}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {maskPhone(c.referredPhone)} · {formatDate(c.purchaseTime ?? c.createdAt)} · {formatPct(c.pct)} của {formatVnd(c.baseAmount)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-extrabold tabular-nums text-[var(--accent)]">+{formatVnd(c.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
