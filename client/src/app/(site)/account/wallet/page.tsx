import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { appFetchSafe, getSessionUser } from "@/lib/appApi";
import type { CoinStatus, WalletSummary, WithdrawalRequest } from "@/lib/appTypes";
import { formatDateTime, formatVnd, WITHDRAWAL_STATUS_LABELS } from "@/lib/format";
import { EMPTY_WALLET } from "@/lib/wallet";
import { PageHeading, SectionCard, StatTile, StatusPill, EmptyState } from "@/components/account/ui";
import WithdrawForm from "@/components/account/WithdrawForm";
import CoinCheckin from "@/components/account/CoinCheckin";
import { WalletIcon } from "@/components/icons";
import type { PillTone } from "@/components/account/ui";

export const metadata: Metadata = { title: "Rút tiền | Rewally" };

const STATUS_TONE: Record<string, PillTone> = {
  pending: "warning",
  approved: "accent",
  rejected: "danger",
  paid: "success",
};

export default async function WalletPage() {
  const [user, wallet, withdrawals, coins] = await Promise.all([
    getSessionUser(),
    appFetchSafe<WalletSummary>("/wallet", EMPTY_WALLET),
    appFetchSafe<WithdrawalRequest[]>("/wallet/withdrawals?limit=50", []),
    // null when the backend is unreachable or check-in is switched off, in
    // which case the card simply does not render.
    appFetchSafe<CoinStatus | null>("/coins", null),
  ]);

  // The layout already guarantees a user; this keeps TypeScript honest.
  if (!user) redirect("/login?next=/account/wallet");

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Rút tiền" description="Nhập số tiền muốn rút về tài khoản ngân hàng đã thiết lập." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Số dư khả dụng" value={formatVnd(wallet.availableAmount)} tone="accent" hint="Có thể rút ngay" />
        <StatTile label="Chờ xác nhận" value={formatVnd(wallet.pendingAmount)} hint={`${wallet.pendingOrders} đơn`} />
        <StatTile label="Đã rút về ngân hàng" value={formatVnd(wallet.paidAmount)} hint={`${wallet.paidOrders} đơn`} />
        {/* Kept as its own tile rather than folded into the balance: xu is a
            separate currency that happens to convert at 1:1 on withdrawal. */}
        <StatTile
          label="Xu tích luỹ"
          value={`${(wallet.coinAvailable ?? 0).toLocaleString("vi-VN")} xu`}
          hint={`1 xu = 1đ · ${formatVnd(wallet.coinAvailable ?? 0)}`}
        />
      </div>

      {/* The withdrawal form is what this page is for, so it goes first; the
          daily check-in is a side errand and sits below it. */}
      <SectionCard title="Tạo yêu cầu rút tiền">
        <WithdrawForm wallet={wallet} user={user} />
      </SectionCard>

      {coins && coins.enabled && (
        <SectionCard title="Điểm danh nhận xu">
          <CoinCheckin initial={coins} />
        </SectionCard>
      )}

      <SectionCard title="Lịch sử rút tiền">
        {withdrawals.length === 0 ? (
          <EmptyState
            icon={WalletIcon}
            title="Chưa có yêu cầu rút tiền nào."
            description="Khi số dư khả dụng đạt mức tối thiểu, bạn có thể tạo yêu cầu rút tiền ở trên."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {withdrawals.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold tabular-nums text-[var(--foreground)]">
                    {formatVnd(item.amount + (item.coinAmount ?? 0))}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {item.coinAmount ? `${formatVnd(item.amount)} + ${item.coinAmount.toLocaleString("vi-VN")} xu · ` : ""}
                    {formatDateTime(item.createdAt)}
                    {item.processedAt && ` · Xử lý ${formatDateTime(item.processedAt)}`}
                  </p>
                </div>
                <StatusPill
                  label={WITHDRAWAL_STATUS_LABELS[item.status] ?? item.status}
                  tone={STATUS_TONE[item.status] ?? "neutral"}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <p className="text-xs leading-relaxed text-[var(--muted)]">
        Tiền hoàn chỉ được cộng vào số dư khả dụng sau khi Shopee đối soát xong đơn hàng. Yêu cầu rút tiền được
        Rewally kiểm tra và chuyển khoản thủ công về tài khoản ngân hàng của bạn.
      </p>
    </div>
  );
}
