import Link from "next/link";
import type { Metadata } from "next";
import { appFetchSafe, getSessionUser } from "@/lib/appApi";
import type { Order, ReferralView, WalletSummary } from "@/lib/appTypes";
import { formatDate, formatPct, formatVnd, orderStatusLabel } from "@/lib/format";
import { EMPTY_WALLET } from "@/lib/wallet";
import { hasBankAccount } from "@/components/account/menu";
import { PageHeading, SectionCard, StatTile, StatusPill, EmptyState } from "@/components/account/ui";
import { orderStatusTone } from "@/components/account/orderStatus";
import { ArrowRightIcon, BagIcon, LinkIcon, UsersIcon, WalletIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Tổng quan | Rewally" };

const SHORTCUTS = [
  { href: "/account/wallet", label: "Rút tiền", icon: WalletIcon },
  { href: "/account/orders", label: "Đơn hàng", icon: BagIcon },
  { href: "/account/links", label: "Tạo link", icon: LinkIcon },
  { href: "/account/referral", label: "Mời bạn bè", icon: UsersIcon },
];

export default async function AccountOverviewPage() {
  const [user, wallet, orders, referral] = await Promise.all([
    getSessionUser(),
    appFetchSafe<WalletSummary>("/wallet", EMPTY_WALLET),
    appFetchSafe<Order[]>("/orders?limit=5", []),
    appFetchSafe<ReferralView | null>("/referral?limit=1", null),
  ]);

  const missingBank = !user || !hasBankAccount(user);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Tổng quan" description="Số dư, đơn hàng gần đây và các lối tắt hay dùng." />

      {missingBank && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger)]/8 px-4 py-3.5">
          <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--foreground)]">
            Bạn cần thiết lập tài khoản ngân hàng trước khi rút tiền.
          </p>
          <Link
            href="/account/bank"
            className="rounded-full bg-[var(--danger)] px-4 py-2 text-xs font-extrabold text-white"
          >
            Thiết lập ngay
          </Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Số dư khả dụng" value={formatVnd(wallet.availableAmount)} tone="accent" hint="Có thể rút ngay" />
        <StatTile label="Chờ đối soát" value={formatVnd(wallet.pendingAmount)} hint={`${wallet.pendingOrders} đơn`} />
        <StatTile label="Đã nhận" value={formatVnd(wallet.paidAmount)} hint={`${wallet.paidOrders} đơn đã thanh toán`} />
        <StatTile label="Nhận trong tháng" value={formatVnd(wallet.paidThisMonth)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SHORTCUTS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-4 text-center transition hover:border-[var(--accent)]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)]">
              <Icon className="h-5 w-5 text-[var(--accent-dark)]" />
            </span>
            <span className="text-xs font-bold text-[var(--foreground)]">{label}</span>
          </Link>
        ))}
      </div>

      {wallet.pendingWithdrawal && (
        <SectionCard title="Yêu cầu đang xử lý">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-extrabold text-[var(--foreground)]">
                {formatVnd(wallet.pendingWithdrawal.amount)}
              </p>
              <p className="text-xs text-[var(--muted)]">
                Gửi ngày {formatDate(wallet.pendingWithdrawal.createdAt)}
              </p>
            </div>
            <StatusPill label="Đang chờ duyệt" tone="warning" />
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Đơn hàng gần đây"
        action={
          <Link href="/account/orders" className="flex items-center gap-1 text-sm font-bold text-[var(--accent)]">
            Xem tất cả
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        }
      >
        {orders.length === 0 ? (
          <EmptyState
            icon={BagIcon}
            title="Chưa có đơn hàng nào"
            description="Mua sắm qua Rewally để đơn hàng của bạn được ghi nhận hoàn tiền."
            cta={{ href: "/products", label: "Mua sắm hoàn tiền" }}
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {orders.map((order) => (
              <li key={order.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                    {order.productName || `Đơn ${order.orderSn}`}
                  </p>
                  <p className="text-xs text-[var(--muted)]">{formatDate(order.purchaseTime ?? order.createdAt)}</p>
                </div>
                <p className="shrink-0 text-sm font-extrabold tabular-nums text-[var(--accent)]">
                  {formatVnd(order.userCommission)}
                </p>
                <StatusPill
                  label={orderStatusLabel(order.displayOrderStatus)}
                  tone={orderStatusTone(order.displayOrderStatus)}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Giới thiệu bạn bè"
        action={
          <Link href="/account/referral" className="flex items-center gap-1 text-sm font-bold text-[var(--accent)]">
            Chi tiết
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Mã giới thiệu của bạn</p>
            <p className="mt-1 text-2xl font-extrabold tracking-[0.2em] text-[var(--accent-dark)]">
              {referral?.referralCode ?? user?.referralCode ?? "------"}
            </p>
          </div>
          <div className="flex gap-8">
            <div>
              <p className="text-lg font-extrabold text-[var(--foreground)]">{referral?.stats.totalInvited ?? 0}</p>
              <p className="text-xs text-[var(--muted)]">Đã mời</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-[var(--foreground)]">{referral?.stats.qualified ?? 0}</p>
              <p className="text-xs text-[var(--muted)]">Đã mua hàng</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-[var(--accent)]">{formatVnd(referral?.stats.totalReward)}</p>
              <p className="text-xs text-[var(--muted)]">Tổng thưởng</p>
            </div>
          </div>
        </div>
        {referral && referral.program.commissionPct > 0 && (
          <p className="mt-4 rounded-xl bg-[var(--accent-soft)] px-3.5 py-2.5 text-xs font-semibold text-[var(--accent-soft-foreground)]">
            Bạn nhận {formatPct(referral.program.commissionPct)} hoa hồng{" "}
            {referral.program.commissionMonths > 0 ? `trong ${referral.program.commissionMonths} tháng` : "trọn đời"} trên mỗi đơn
            hàng bạn bè đặt qua Rewally.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
