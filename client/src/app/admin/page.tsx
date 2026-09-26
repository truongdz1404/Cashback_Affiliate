"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Chip, Spinner, toast } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatDateTime } from "@/lib/format";
import { lastNDays } from "@/lib/dateRange";
import { share, type Analytics } from "@/lib/analytics";
import { Sparkline, TrendChart, compactNumber } from "@/components/admin/charts";
import {
  ErrorBanner,
  PageHeader,
  SectionCard,
  StatCard,
  StatGrid,
} from "@/components/admin/ui";
import {
  ArrowRightIcon,
  BagIcon,
  BoltIcon,
  CoinIcon,
  ReceiptIcon,
  RefreshIcon,
  ShieldIcon,
  StoreIcon,
  TrendUpIcon,
  UserPlusIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/icons";

type Stats = {
  completedOrders?: number;
  pendingOrders?: number;
  paidOrders?: number;
  unpaidOrders?: number;
  totalCommission?: number;
  totalUserCommission?: number;
  totalOperatorCommission?: number;
  totalPaidAmount?: number;
  totalUnpaidAmount?: number;
};

type Session = { loggedIn?: boolean };

type Withdrawal = {
  id: number;
  amount: number;
  coinAmount?: number | null;
  status: string;
  createdAt: string;
  userPhone?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
};

type Resolutions = { counts?: Record<string, number> };

// GET /admin/shopee-api/health?probe=1 - what Shopee says about our affiliate
// account right now, not what this service last assumed.
type ShopeeProbe = {
  ok?: boolean;
  error?: string;
  affiliateId?: string | null;
  validAffiliateId?: string | null;
  accountStatus?: number | null;
  reviewStatus?: number | null;
  stopCommissionCalculation?: boolean | null;
  stopCommissionCalculationTime?: string | null;
  frozenReason?: string | null;
  banDate?: number | string | null;
  allowToLogin?: boolean | null;
  programType?: number | null;
};

type ShopeeHealth = {
  transport?: string;
  blocked?: boolean;
  blockedUntil?: string | null;
  probe?: ShopeeProbe;
};

type JobRun = {
  id: number;
  job: string;
  status: string;
  trigger: string;
  startedAt: string;
  durationMs?: number | null;
  resultJson?: string | null;
  error?: string | null;
};

type ReferralRow = { id: number; amount: number; payoutStatus: string };

const moneyTick = (value: number) => compactNumber(value) + "đ";

// HeroUI's Button has no polymorphic `as`, so a card action that navigates is
// a real <Link> wearing the button's clothes rather than a button with an
// onPress that pushes a route - middle-click and "open in new tab" keep working.
const LINK_BUTTON =
  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[var(--accent-dark)] transition hover:bg-[var(--accent-soft)]";

// The dashboard answers two questions and nothing else: "is the money moving
// the way it should" and "what is waiting for me right now". Anything that
// needs a date window or a table belongs on /admin/reports or the list
// screens, which is why every card here links somewhere.
export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<Withdrawal[]>([]);
  const [unpaidReferrals, setUnpaidReferrals] = useState<ReferralRow[]>([]);
  const [resolutions, setResolutions] = useState<Resolutions | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  // Bumped after a manual reconcile so the panel below re-reads "đối soát gần
  // nhất" instead of still showing the previous run.
  const [shopeeReloadKey, setShopeeReloadKey] = useState(0);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    const { from, to } = lastNDays(30);
    try {
      // Everything on this screen is independent, and the queue counts are the
      // slowest of the six - fetching them in sequence would leave the page
      // blank for as long as the sum of all of them.
      const [s, a, sess, w, r, res] = await Promise.all([
        clientApi.get<Stats>("/api/stats"),
        clientApi.get<Analytics>(`/api/analytics?from=${from}&to=${to}&topLimit=5`),
        clientApi.get<Session>("/api/session"),
        clientApi.get<Withdrawal[]>("/api/withdrawals?status=pending"),
        clientApi.get<ReferralRow[]>("/api/referral-commissions?payoutStatus=unpaid&limit=500"),
        clientApi.get<Resolutions>("/api/shop-name-resolutions?status=pending&limit=1"),
      ]);
      setStats(s);
      setAnalytics(a);
      setSession(sess);
      setPendingWithdrawals(Array.isArray(w) ? w : []);
      setUnpaidReferrals(Array.isArray(r) ? r : []);
      setResolutions(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runReconcile() {
    setReconciling(true);
    try {
      const result = await clientApi.post<{ skipped?: boolean; upserted?: number }>("/api/reconcile");
      toast.success(
        result?.skipped
          ? "Một lượt đối soát khác đang chạy — đã bỏ qua lượt này"
          : `Đã đối soát xong (${result?.upserted ?? 0} đơn được ghi)`,
      );
      setShopeeReloadKey((k) => k + 1);
      await load();
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Đối soát thất bại");
    } finally {
      setReconciling(false);
    }
  }

  const queue = useMemo(() => {
    const withdrawalTotal = pendingWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
    const referralTotal = unpaidReferrals.reduce((sum, r) => sum + (r.amount || 0), 0);
    return [
      {
        href: "/admin/withdrawals",
        icon: <WalletIcon className="h-4 w-4" />,
        label: "Yêu cầu rút tiền chờ duyệt",
        count: pendingWithdrawals.length,
        hint: withdrawalTotal ? formatAmount(withdrawalTotal) : undefined,
      },
      {
        href: "/admin/orders",
        icon: <ReceiptIcon className="h-4 w-4" />,
        label: "Đơn hoàn thành chưa trả tiền",
        count: stats?.unpaidOrders ?? 0,
        hint: stats?.totalUnpaidAmount ? formatAmount(stats.totalUnpaidAmount) : undefined,
      },
      {
        href: "/admin/referrals",
        icon: <UserPlusIcon className="h-4 w-4" />,
        label: "Hoa hồng giới thiệu chưa trả",
        count: unpaidReferrals.length,
        hint: referralTotal ? formatAmount(referralTotal) : undefined,
      },
      {
        href: "/admin/shops/resolutions",
        icon: <StoreIcon className="h-4 w-4" />,
        label: "Tên shop chờ khớp thủ công",
        count: resolutions?.counts?.pending ?? 0,
      },
    ];
  }, [pendingWithdrawals, unpaidReferrals, resolutions, stats]);

  const openTasks = queue.reduce((sum, item) => sum + item.count, 0);
  const series = useMemo(() => analytics?.series ?? [], [analytics]);
  const labels = useMemo(
    () => series.map((p) => p.date.slice(8, 10) + "/" + p.date.slice(5, 7)),
    [series],
  );

  if (loading && !stats) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-[var(--muted)]">
        <Spinner size="sm" />
        Đang tải tổng quan…
      </div>
    );
  }

  const now = analytics?.totals;
  const prev = analytics?.previous;
  const cancelRate = now ? share(now.cancelledOrders, now.orders) : 0;
  const prevCancelRate = prev ? share(prev.cancelledOrders, prev.orders) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan"
        description="30 ngày gần nhất, so với 30 ngày liền trước."
        actions={
          <>
            {session && (
              <Chip color={session.loggedIn ? "success" : "danger"}>
                {session.loggedIn ? "Phiên Shopee: đang hoạt động" : "Phiên Shopee: chưa đăng nhập"}
              </Chip>
            )}
            <Button variant="outline" onPress={load} isDisabled={loading}>
              <RefreshIcon className="h-4 w-4" />
              Làm mới
            </Button>
            <Button onPress={runReconcile} isDisabled={reconciling} isPending={reconciling}>
              <BoltIcon className="h-4 w-4" />
              {reconciling ? "Đang đối soát…" : "Đối soát ngay"}
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} onRetry={load} />

      {!session?.loggedIn && (
        <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/8 px-3 py-2 text-sm text-[var(--warning)]">
          Phiên Shopee đã hết hạn — các job lấy đơn và tạo link sẽ lỗi cho tới khi nạp lại cookie ở{" "}
          <Link href="/admin/settings" className="font-medium underline">
            Cài đặt
          </Link>
          .
        </div>
      )}

      {now && prev && (
        <StatGrid>
          <StatCard
            label="Đơn trong kỳ"
            value={now.orders.toLocaleString("vi-VN")}
            hint={`${now.completedOrders.toLocaleString("vi-VN")} hoàn thành`}
            icon={<BagIcon className="h-4 w-4" />}
            current={now.orders}
            previous={prev.orders}
          />
          <StatCard
            label="Hoa hồng người dùng"
            value={formatAmount(now.userCommission)}
            hint="chỉ tính đơn hoàn thành"
            tone="accent"
            icon={<CoinIcon className="h-4 w-4" />}
            current={now.userCommission}
            previous={prev.userCommission}
          />
          <StatCard
            label="Hoa hồng vận hành"
            value={formatAmount(now.operatorCommission)}
            icon={<TrendUpIcon className="h-4 w-4" />}
            current={now.operatorCommission}
            previous={prev.operatorCommission}
          />
          <StatCard
            label="Người dùng mới"
            value={now.newUsers.toLocaleString("vi-VN")}
            hint={`${now.buyers.toLocaleString("vi-VN")} người có đơn`}
            icon={<UsersIcon className="h-4 w-4" />}
            current={now.newUsers}
            previous={prev.newUsers}
          />
        </StatGrid>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Dòng tiền 30 ngày"
          description="Hoa hồng người dùng và phần vận hành theo từng ngày."
          actions={
            <Link href="/admin/reports" className={LINK_BUTTON}>
              Xem báo cáo
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        >
          {series.length ? (
            <TrendChart
              labels={labels}
              formatValue={moneyTick}
              series={[
                { key: "user", name: "Hoàn cho khách", values: series.map((p) => p.userCommission), area: true },
                {
                  key: "operator",
                  name: "Phần vận hành",
                  values: series.map((p) => p.operatorCommission),
                  color: "var(--success)",
                },
              ]}
            />
          ) : (
            <p className="py-6 text-center text-sm text-[var(--muted)]">Chưa có dữ liệu.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Việc cần làm"
          description={openTasks ? `${openTasks.toLocaleString("vi-VN")} mục đang chờ xử lý.` : undefined}
          bodyClassName="p-0"
        >
          {openTasks === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              Không còn gì phải duyệt. 🎉
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {queue.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-secondary)]"
                  >
                    <span
                      className={`shrink-0 rounded-lg p-2 ${
                        item.count
                          ? "bg-[var(--accent-soft)] text-[var(--accent-dark)]"
                          : "bg-[var(--surface-secondary)] text-[var(--muted)]"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[var(--foreground)]">{item.label}</span>
                      {item.hint && <span className="block text-xs text-[var(--muted)]">{item.hint}</span>}
                    </span>
                    <span
                      className={`shrink-0 text-base font-semibold tabular-nums ${
                        item.count ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                      }`}
                    >
                      {item.count.toLocaleString("vi-VN")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Nhịp đơn hàng"
          description="Tổng đơn, đơn hoàn thành và đơn bị huỷ theo ngày."
        >
          {series.length ? (
            <TrendChart
              labels={labels}
              height={200}
              formatValue={(v) => String(Math.round(v))}
              series={[
                { key: "orders", name: "Ghi nhận", values: series.map((p) => p.orders), area: true },
                {
                  key: "done",
                  name: "Hoàn thành",
                  values: series.map((p) => p.completedOrders),
                  color: "var(--success)",
                },
                {
                  key: "cancelled",
                  name: "Huỷ",
                  values: series.map((p) => p.cancelledOrders),
                  color: "var(--danger)",
                },
              ]}
            />
          ) : (
            <p className="py-6 text-center text-sm text-[var(--muted)]">Chưa có dữ liệu.</p>
          )}
        </SectionCard>

        <div className="space-y-4">
          {now && prev && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Tỷ lệ huỷ"
                value={`${cancelRate.toFixed(1)}%`}
                tone={cancelRate > 15 ? "danger" : "default"}
                current={cancelRate}
                previous={prevCancelRate}
                invertDelta
              />
              <StatCard
                label="HH trung bình/đơn"
                value={formatAmount(now.avgCommissionPerOrder)}
                current={now.avgCommissionPerOrder}
                previous={prev.avgCommissionPerOrder}
              />
            </div>
          )}
          <SectionCard title="Người dùng mới theo ngày" bodyClassName="pt-1">
            {series.length ? (
              <Sparkline values={series.map((p) => p.newUsers)} />
            ) : (
              <p className="py-4 text-center text-sm text-[var(--muted)]">Chưa có dữ liệu.</p>
            )}
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="Rút tiền đang chờ duyệt"
        description="Duyệt và chuyển khoản ở màn Rút tiền."
        actions={
          <Link href="/admin/withdrawals" className={LINK_BUTTON}>
            Mở màn rút tiền
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        }
        bodyClassName="p-0"
      >
        {pendingWithdrawals.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">Không có yêu cầu nào đang chờ.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {pendingWithdrawals.slice(0, 5).map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <span className="font-medium text-[var(--foreground)]">{w.userPhone || `#${w.id}`}</span>
                <span className="tabular-nums text-[var(--accent-dark)]">{formatAmount(w.amount)}</span>
                {w.bankName && <span className="text-xs text-[var(--muted)]">{w.bankName}</span>}
                <span className="ml-auto text-xs text-[var(--muted)]">{formatDateTime(w.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <ShopeeStatusSection reloadKey={shopeeReloadKey} />

      <SectionCard title="Luỹ kế toàn hệ thống" description="Không giới hạn theo ngày.">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Đơn hoàn thành", value: (stats?.completedOrders ?? 0).toLocaleString("vi-VN") },
            { label: "Đơn đang chờ Shopee", value: (stats?.pendingOrders ?? 0).toLocaleString("vi-VN") },
            { label: "Tổng hoa hồng Shopee", value: formatAmount(stats?.totalCommission) },
            { label: "Đã trả cho khách", value: formatAmount(stats?.totalPaidAmount) },
            { label: "Còn phải trả khách", value: formatAmount(stats?.totalUnpaidAmount) },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-xs text-[var(--muted)]">{item.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--foreground)]">{item.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// How long we let "đối soát gần nhất" get before saying so. The cron runs
// hourly, so anything past three hours means two ticks went missing - which is
// exactly the failure this panel exists to make visible, and exactly the one
// that used to need an SSH session to notice.
const RECONCILE_STALE_MS = 3 * 60 * 60 * 1000;

function Field({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "danger" }) {
  return (
    <div>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p
        className={`mt-0.5 text-sm font-medium tabular-nums ${
          tone === "danger" ? "text-[var(--danger)]" : "text-[var(--foreground)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * "Is Shopee still paying us?" - one panel instead of a shell on the VPS.
 *
 * This exists because of a real incident: an order placed through one of our
 * links never turned into commission, and answering "why" meant SSH-ing to the
 * box, running a script inside the API container and reading Shopee's
 * /user/status by hand. Everything that investigation needed is on screen here.
 *
 * The probe is a live call to Shopee on every mount, deliberately. A cached
 * answer cannot tell you the account was frozen twenty minutes ago, and the
 * whole class of problem this catches is silent - status: 1 with commission
 * calculation quietly switched off looks identical to "nobody bought anything".
 * The API client rate-limits and circuit-breaks its own calls, and this screen
 * gets a few dozen views a day, so one call per mount is affordable.
 */
function ShopeeStatusSection({ reloadKey }: { reloadKey: number }) {
  const [health, setHealth] = useState<ShopeeHealth | null>(null);
  const [lastRun, setLastRun] = useState<JobRun | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Independent, and the probe is the slow one - no reason for the job-run
      // row to wait behind a round trip to Shopee.
      const [h, runs] = await Promise.all([
        clientApi.get<ShopeeHealth>("/api/shopee-api/health?probe=1"),
        clientApi.get<{ items: JobRun[] }>("/api/job-runs?job=order-reconcile&limit=1"),
      ]);
      setHealth(h);
      setLastRun(runs.items?.[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đọc được tình trạng Shopee");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const probe = health?.probe;

  // Everything that would stop commission arriving, worst first. Each line
  // names the raw field, because the next person debugging this will be
  // comparing it against Shopee's own API response.
  const problems = useMemo(() => {
    const list: string[] = [];
    if (!health) return list;
    if (health.blocked) {
      list.push(
        `Cầu dao API đang mở — Shopee đang chặn, thử lại sau ${
          health.blockedUntil ? formatDateTime(health.blockedUntil) : "ít phút"
        }`,
      );
    }
    if (!probe) return list;
    if (probe.ok === false) {
      list.push(`Không hỏi được Shopee: ${probe.error || "lỗi không rõ"}`);
      return list;
    }
    if (probe.stopCommissionCalculation === true) {
      list.push(
        `Shopee đã NGỪNG tính hoa hồng cho tài khoản này${
          probe.stopCommissionCalculationTime ? ` (từ ${probe.stopCommissionCalculationTime})` : ""
        } — đơn mới sẽ không được ghi nhận`,
      );
    }
    // The nastiest failure mode there is: links keep working, keep looking
    // right, and credit somebody else's account.
    if (probe.affiliateId && probe.validAffiliateId && probe.affiliateId !== probe.validAffiliateId) {
      list.push(
        `affiliate_id (${probe.affiliateId}) khác id Shopee sẽ ghi nhận (${probe.validAffiliateId}) — link đang trả hoa hồng về tài khoản khác`,
      );
    }
    if (probe.accountStatus != null && probe.accountStatus !== 1) {
      list.push(`Tài khoản không ở trạng thái hoạt động (status = ${probe.accountStatus})`);
    }
    if (probe.reviewStatus != null && probe.reviewStatus !== 1) {
      list.push(`Tài khoản chưa được duyệt (review_status = ${probe.reviewStatus})`);
    }
    if (probe.frozenReason) list.push(`Tài khoản bị đóng băng: ${probe.frozenReason}`);
    if (probe.banDate) list.push(`Tài khoản có ban_date = ${probe.banDate}`);
    if (probe.allowToLogin === false) list.push("Shopee không cho tài khoản này đăng nhập (allow_to_login = false)");
    return list;
  }, [health, probe]);

  const reconcileAgeMs = lastRun ? Date.now() - new Date(lastRun.startedAt).getTime() : null;
  const reconcileStale = reconcileAgeMs != null && reconcileAgeMs > RECONCILE_STALE_MS;

  // `{"processed":41,"upserted":7,"totalCount":7,"pages":1}` reads better as a
  // sentence, but a job whose result shape changes must not crash the panel.
  const lastResult = useMemo(() => {
    if (!lastRun?.resultJson) return null;
    try {
      const r = JSON.parse(lastRun.resultJson) as { processed?: number; upserted?: number; totalCount?: number };
      if (r.processed == null && r.upserted == null) return lastRun.resultJson;
      return `${r.processed ?? 0} đơn đọc từ Shopee, ${r.upserted ?? 0} đơn ghi vào DB${
        r.totalCount != null ? `, Shopee báo tổng ${r.totalCount}` : ""
      }`;
    } catch {
      return lastRun.resultJson;
    }
  }, [lastRun]);

  return (
    <SectionCard
      title="Tình trạng Shopee"
      description="Hỏi thẳng Shopee về tài khoản affiliate, kèm lượt đối soát gần nhất. Đây là chỗ để biết vì sao đơn không lên hoa hồng."
      actions={
        <Button variant="outline" onPress={load} isDisabled={loading}>
          <RefreshIcon className="h-4 w-4" />
          Kiểm tra lại
        </Button>
      }
    >
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {loading && !health && (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <Spinner size="sm" />
          Đang hỏi Shopee…
        </div>
      )}

      {health && (
        <div className="space-y-4">
          {problems.length > 0 ? (
            <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/8 px-3 py-2.5">
              <p className="text-sm font-semibold text-[var(--danger)]">Có vấn đề cần xử lý</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[var(--danger)]">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : (
            probe?.ok && (
              <p className="flex items-center gap-1.5 text-sm text-[var(--success)]">
                <ShieldIcon className="h-4 w-4" />
                Tài khoản affiliate đang hoạt động bình thường
                {/* Only claim this when Shopee actually answered the flag. An
                    older API build does not return it, and "vẫn đang tính hoa
                    hồng" is the one sentence on this screen that must never be
                    a guess - it is the exact thing someone comes here to check. */}
                {probe.stopCommissionCalculation == null ? "." : ", Shopee vẫn đang tính hoa hồng."}
              </p>
            )
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="affiliate_id" value={probe?.affiliateId || "-"} />
            <Field
              label="Trạng thái tài khoản"
              value={
                probe?.accountStatus == null
                  ? "-"
                  : probe.accountStatus === 1
                    ? "Hoạt động (1)"
                    : `Bất thường (${probe.accountStatus})`
              }
              tone={probe?.accountStatus != null && probe.accountStatus !== 1 ? "danger" : "default"}
            />
            <Field
              label="Trạng thái duyệt"
              value={
                probe?.reviewStatus == null
                  ? "-"
                  : probe.reviewStatus === 1
                    ? "Đã duyệt (1)"
                    : `Chưa duyệt (${probe.reviewStatus})`
              }
              tone={probe?.reviewStatus != null && probe.reviewStatus !== 1 ? "danger" : "default"}
            />
            <Field
              label="Shopee tính hoa hồng"
              value={
                probe?.stopCommissionCalculation == null
                  ? "-"
                  : probe.stopCommissionCalculation
                    ? "ĐÃ NGỪNG"
                    : "Đang tính"
              }
              tone={probe?.stopCommissionCalculation ? "danger" : "default"}
            />
          </div>

          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Đối soát gần nhất</p>
            {!lastRun ? (
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                Chưa có lượt nào được ghi lại. Nhật ký đối soát bắt đầu từ bản deploy này — lượt đầu tiên sẽ xuất hiện ở
                đây trong vòng một giờ.
              </p>
            ) : (
              <div className="mt-1.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Chip
                    color={lastRun.status === "done" ? "success" : lastRun.status === "error" ? "danger" : "warning"}
                  >
                    {lastRun.status === "done" ? "thành công" : lastRun.status === "error" ? "lỗi" : "đang chạy"}
                  </Chip>
                  <span className={reconcileStale ? "font-medium text-[var(--warning)]" : "text-[var(--foreground)]"}>
                    {formatDateTime(lastRun.startedAt)}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {lastRun.trigger === "cron" ? "tự động" : lastRun.trigger === "boot" ? "khi khởi động" : "bấm tay"}
                    {lastRun.durationMs != null && ` · ${Math.max(1, Math.round(lastRun.durationMs / 1000))}s`}
                  </span>
                </div>
                {lastRun.error ? (
                  <p className="text-sm text-[var(--danger)]">{lastRun.error}</p>
                ) : (
                  lastResult && <p className="text-sm text-[var(--muted)]">{lastResult}</p>
                )}
                {reconcileStale && lastRun.status !== "running" && (
                  <p className="text-sm text-[var(--warning)]">
                    Đã quá 3 giờ chưa có lượt đối soát nào — cron chạy mỗi giờ, nên nhiều khả năng service đang gặp sự cố.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
