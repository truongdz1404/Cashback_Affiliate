import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { appFetchSafe, getSessionUser } from "@/lib/appApi";
import type { WalletSummary, WithdrawalRequest } from "@/lib/appTypes";
import { formatDateTime, formatVnd, WITHDRAWAL_STATUS_LABELS } from "@/lib/format";
import { SectionCard, StatTile, StatusPill, EmptyState } from "@/components/account/ui";
import WithdrawForm from "@/components/account/WithdrawForm";
import { WalletIcon } from "@/components/icons";
import type { PillTone } from "@/components/account/ui";

export const metadata: Metadata = { title: "Ví hoàn tiền | Rewally" };

const EMPTY_WALLET: WalletSummary = {
  paidOrders: 0,
  paidAmount: 0,
  unpaidOrders: 0,
  unpaidAmount: 0,
  pendingOrders: 0,
  pendingAmount: 0,
  paidThisMonth: 0,
  availableAmount: 0,
  minWithdrawAmount: 0,
  pendingWithdrawal: null,
};

const STATUS_TONE: Record<string, PillTone> = {
  pending: "warning",
  approved: "accent",
  rejected: "danger",
  paid: "success",
};

export default async function WalletPage() {
  const [user, wallet, withdrawals] = await Promise.all([
    getSessionUser(),
    appFetchSafe<WalletSummary>("/wallet", EMPTY_WALLET),
    appFetchSafe<WithdrawalRequest[]>("/wallet/withdrawals?limit=50", []),
  ]);

  // The layout already guarantees a user; this keeps TypeScript honest.
  if (!user) redirect("/login?next=/account/wallet");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-extrabold text-[var(--foreground)]">Thanh toán</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Chọn ví và nhập số tiền muốn thanh toán</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Đã duyệt" value={formatVnd(wallet.availableAmount)} tone="accent" hint="Số dư khả dụng" />
        <StatTile label="Chờ đối soát" value={formatVnd(wallet.pendingAmount)} hint={`${wallet.pendingOrders} đơn`} />
        <StatTile label="Đã nhận" value={formatVnd(wallet.paidAmount)} hint={`${wallet.paidOrders} đơn`} />
      </div>

      <SectionCard title="Tạo yêu cầu thanh toán">
        <WithdrawForm wallet={wallet} user={user} />
      </SectionCard>

      <SectionCard title="Lịch sử rút tiền">
        {withdrawals.length === 0 ? (
          <EmptyState
            icon={WalletIcon}
            title="Chưa có yêu cầu rút tiền nào."
            description="Khi số dư khả dụng đạt mức tối thiểu, bạn có thể tạo yêu cầu thanh toán ở trên."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {withdrawals.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold tabular-nums text-[var(--foreground)]">
                    {formatVnd(item.amount)}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
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
        Tiền hoàn chỉ chuyển sang trạng thái &ldquo;Đã duyệt&rdquo; sau khi Shopee đối soát xong đơn hàng. Yêu cầu
        thanh toán được admin duyệt và chuyển khoản thủ công.
      </p>
    </div>
  );
}
