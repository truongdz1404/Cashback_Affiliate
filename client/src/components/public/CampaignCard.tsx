import type { Campaign } from "@/lib/appTypes";
import { formatDate, formatVnd } from "@/lib/format";
import { AuthDialogTrigger } from "@/components/public/AuthDialog";
import { CheckIcon, GiftIcon } from "@/components/icons";

// Mirrors the mobile app's campaign card (tiers, progress, unlocked rewards).
// For anonymous visitors the backend returns paidAmount: 0 and no rewards
// (campaignsRepo.viewForAnonymous), so the progress section is replaced by a
// sign-in prompt instead of showing a misleading 0% bar.
export default function CampaignCard({
  campaign,
  isAuthenticated,
}: {
  campaign: Campaign;
  isAuthenticated: boolean;
}) {
  const tiers = [...campaign.tiers].sort((a, b) => a.amount - b.amount);
  const nextTier = tiers.find((t) => t.amount > campaign.paidAmount);
  const progress = tiers.length === 0 ? 0 : nextTier ? campaign.paidAmount / nextTier.amount : 1;
  const rewarded = new Set(campaign.rewardsEarned.map((r) => r.thresholdAmount));
  const totalReward = campaign.rewardsEarned.reduce((sum, r) => sum + r.rewardAmount, 0);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-[var(--foreground)]">{campaign.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
            {campaign.description ?? "Hoàn thành thêm đơn để nhận thưởng."}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${
            campaign.isActive
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "bg-[var(--surface-secondary)] text-[var(--muted)]"
          }`}
        >
          {campaign.isActive ? "Đang mở" : "Đã đóng"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--surface-secondary)] p-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--muted)]">Bắt đầu</dt>
          <dd className="font-bold text-[var(--foreground)]">{formatDate(campaign.startsAt) || "Chưa cập nhật"}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">Kết thúc</dt>
          <dd className="font-bold text-[var(--foreground)]">{formatDate(campaign.endsAt) || "Chưa cập nhật"}</dd>
        </div>
      </dl>

      {isAuthenticated ? (
        <>
          <div className="mt-5 flex items-center justify-between text-sm">
            <span className="text-[var(--muted)]">Tiến độ tiền hoàn</span>
            <span className="font-extrabold text-[var(--foreground)]">{formatVnd(campaign.paidAmount)}</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]">
            <div
              className="h-full rounded-full bg-[var(--success)]"
              style={{ width: `${Math.min(Math.max(progress, 0), 1) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {nextTier
              ? `Còn ${formatVnd(Math.max(nextTier.amount - campaign.paidAmount, 0))} tiền hoàn để nhận ${formatVnd(nextTier.reward)}`
              : "Bạn đã hoàn thành tất cả mốc thưởng"}
          </p>
        </>
      ) : (
        <p className="mt-5 rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-xs font-semibold text-[var(--accent)]">
          <AuthDialogTrigger
            className="underline"
            title="Đăng nhập để theo dõi sự kiện"
            description={`Tiến độ và mốc thưởng của bạn trong “${campaign.title}” sẽ hiển thị sau khi đăng nhập.`}
          >
            Đăng nhập
          </AuthDialogTrigger>{" "}
          để theo dõi tiến độ của bạn trong sự kiện này.
        </p>
      )}

      {tiers.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2">
          {tiers.map((tier) => {
            const done = isAuthenticated && campaign.paidAmount >= tier.amount;
            const isNext = isAuthenticated && !done && tier.amount === nextTier?.amount;
            return (
              <li
                key={tier.amount}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  done
                    ? "border-[var(--success)] bg-[var(--success)] text-white"
                    : isNext
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                }`}
              >
                {rewarded.has(tier.amount) ? <CheckIcon className="h-3.5 w-3.5" /> : <GiftIcon className="h-3.5 w-3.5" />}
                {formatVnd(tier.amount)} → <span className="font-extrabold">{formatVnd(tier.reward)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {isAuthenticated && campaign.rewardsEarned.length > 0 && (
        <div className="mt-auto flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-4 py-3 pt-3">
          <div>
            <p className="text-sm font-extrabold text-[var(--foreground)]">Thưởng đã mở khóa</p>
            <p className="text-xs text-[var(--muted)]">{campaign.rewardsEarned.length} mốc thưởng</p>
          </div>
          <p className="text-base font-extrabold text-[var(--accent)]">{formatVnd(totalReward)}</p>
        </div>
      )}
    </article>
  );
}
