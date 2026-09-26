"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Tabs } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatPct, displayStatusLabel } from "@/lib/format";
import { lastNDays, formatRange, type DayRange } from "@/lib/dateRange";
import { share, type Analytics, type AnalyticsPoint } from "@/lib/analytics";
import { datedFilename, downloadCsv } from "@/lib/exportCsv";
import { BarList, DonutChart, TrendChart, compactNumber } from "@/components/admin/charts";
import {
  ErrorBanner,
  PageHeader,
  RangePicker,
  SectionCard,
  StatCard,
  StatGrid,
} from "@/components/admin/ui";
import {
  BagIcon,
  CoinIcon,
  DownloadIcon,
  RefreshIcon,
  TrendUpIcon,
  UserPlusIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/icons";

const moneyTick = (value: number) => compactNumber(value) + "đ";
const dayTick = (date: string) => date.slice(8, 10) + "/" + date.slice(5, 7);

type Insight = { tone: "good" | "bad" | "neutral"; text: string };

// The written summary under the charts. It is deliberately plain arithmetic on
// the same numbers the charts draw - nothing here is a model or a forecast,
// so nothing here can claim more than the data supports.
function buildInsights(data: Analytics): Insight[] {
  const { totals: now, previous: prev, series } = data;
  const out: Insight[] = [];

  const pct = (current: number, before: number) =>
    before > 0 ? ((current - before) / before) * 100 : null;

  const orderDelta = pct(now.completedOrders, prev.completedOrders);
  if (orderDelta !== null) {
    out.push({
      tone: orderDelta >= 0 ? "good" : "bad",
      text: `Đơn hoàn thành ${orderDelta >= 0 ? "tăng" : "giảm"} ${Math.abs(orderDelta).toFixed(1)}% so với kỳ trước (${now.completedOrders} so với ${prev.completedOrders} đơn).`,
    });
  } else if (now.completedOrders > 0) {
    out.push({ tone: "good", text: `Kỳ trước chưa có đơn hoàn thành nào, kỳ này đã có ${now.completedOrders} đơn.` });
  }

  const moneyDelta = pct(now.userCommission, prev.userCommission);
  if (moneyDelta !== null) {
    out.push({
      tone: moneyDelta >= 0 ? "good" : "bad",
      text: `Hoàn tiền cho khách ${moneyDelta >= 0 ? "tăng" : "giảm"} ${Math.abs(moneyDelta).toFixed(1)}%, đạt ${formatAmount(now.userCommission)}.`,
    });
  }

  const cancelNow = share(now.cancelledOrders, now.orders);
  const cancelPrev = share(prev.cancelledOrders, prev.orders);
  if (now.orders > 0) {
    out.push({
      tone: cancelNow > cancelPrev + 1 ? "bad" : cancelNow < cancelPrev - 1 ? "good" : "neutral",
      text: `Tỉ lệ đơn bị huỷ ${formatPct(cancelNow)}${prev.orders > 0 ? ` (kỳ trước ${formatPct(cancelPrev)})` : ""}.`,
    });
  }

  // Momentum inside the window itself: the second half against the first. A
  // period can be up on the previous one and still be fading week by week.
  const half = Math.floor(series.length / 2);
  if (half >= 2) {
    const avg = (points: AnalyticsPoint[]) => points.reduce((s, p) => s + p.completedOrders, 0) / (points.length || 1);
    const firstHalf = avg(series.slice(0, half));
    const secondHalf = avg(series.slice(series.length - half));
    if (firstHalf > 0 || secondHalf > 0) {
      const trend = secondHalf - firstHalf;
      out.push({
        tone: trend > 0 ? "good" : trend < 0 ? "bad" : "neutral",
        text:
          trend === 0
            ? "Nhịp đặt đơn trong kỳ đi ngang giữa nửa đầu và nửa sau."
            : `Nửa sau của kỳ ${trend > 0 ? "sôi động hơn" : "chậm lại so với"} nửa đầu: ${secondHalf.toFixed(1)} so với ${firstHalf.toFixed(1)} đơn hoàn thành mỗi ngày.`,
      });
    }
  }

  const best = series.reduce<AnalyticsPoint | null>(
    (top, p) => (!top || p.userCommission > top.userCommission ? p : top),
    null,
  );
  if (best && best.userCommission > 0) {
    out.push({
      tone: "neutral",
      text: `Ngày cao nhất là ${dayTick(best.date)} với ${formatAmount(best.userCommission)} hoàn cho khách từ ${best.completedOrders} đơn.`,
    });
  }

  if (now.unpaidAmount > 0) {
    out.push({
      tone: "bad",
      text: `Còn ${formatAmount(now.unpaidAmount)} hoa hồng đã hoàn thành nhưng chưa chi trả cho khách trong kỳ này.`,
    });
  }

  const userDelta = pct(now.newUsers, prev.newUsers);
  out.push({
    tone: userDelta === null ? "neutral" : userDelta >= 0 ? "good" : "bad",
    text: `${now.newUsers} người dùng mới${userDelta === null ? "" : ` (${userDelta >= 0 ? "+" : ""}${userDelta.toFixed(1)}% so với kỳ trước)`}, ${now.buyers} người thực sự phát sinh đơn.`,
  });

  return out;
}

const INSIGHT_TONE = {
  good: "border-[var(--success)]/30 bg-[var(--success)]/8 text-[var(--success)]",
  bad: "border-[var(--danger)]/30 bg-[var(--danger)]/8 text-[var(--danger)]",
  neutral: "border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--muted)]",
} as const;

export default function ReportsPage() {
  const [range, setRange] = useState<DayRange>(() => lastNDays(30));
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      setData(await clientApi.get<Analytics>(`/api/analytics?${params.toString()}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được số liệu");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);
  const labels = useMemo(() => (data?.series ?? []).map((p) => dayTick(p.date)), [data]);

  function exportSeries() {
    if (!data) return;
    downloadCsv(datedFilename("bao-cao"), data.series, [
      { header: "Ngày", value: (p) => p.date },
      { header: "Tổng đơn", value: (p) => p.orders },
      { header: "Hoàn thành", value: (p) => p.completedOrders },
      { header: "Đang chờ", value: (p) => p.pendingOrders },
      { header: "Đã huỷ", value: (p) => p.cancelledOrders },
      { header: "Hoa hồng Shopee", value: (p) => p.totalCommission },
      { header: "Hoàn cho khách", value: (p) => p.userCommission },
      { header: "Phần vận hành", value: (p) => p.operatorCommission },
      { header: "Đã chi trả", value: (p) => p.paidAmount },
      { header: "Chưa chi trả", value: (p) => p.unpaidAmount },
      { header: "Người dùng mới", value: (p) => p.newUsers },
      { header: "Yêu cầu rút", value: (p) => p.withdrawals },
    ]);
  }

  const totals = data?.totals;
  const previous = data?.previous;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Báo cáo & thống kê"
        description={
          data
            ? `${formatRange(range)} · so sánh với ${formatRange({ from: data.range.previousFrom, to: data.range.previousTo })}`
            : "Đang tải số liệu…"
        }
        actions={
          <>
            <Button size="sm" variant="outline" onPress={load} isDisabled={loading}>
              <RefreshIcon className="h-4 w-4" />
              Làm mới
            </Button>
            <Button size="sm" variant="outline" onPress={exportSeries} isDisabled={!data}>
              <DownloadIcon className="h-4 w-4" />
              Xuất CSV
            </Button>
          </>
        }
      />

      <RangePicker range={range} onChange={setRange} />

      <ErrorBanner message={error} onRetry={load} />

      {totals && previous && (
        <StatGrid>
          <StatCard
            label="Đơn hoàn thành"
            value={totals.completedOrders.toLocaleString("vi-VN")}
            current={totals.completedOrders}
            previous={previous.completedOrders}
            hint={`${totals.orders} đơn ghi nhận`}
            icon={<BagIcon className="h-4 w-4" />}
          />
          <StatCard
            label="Hoàn cho khách"
            value={formatAmount(totals.userCommission)}
            tone="accent"
            current={totals.userCommission}
            previous={previous.userCommission}
            hint={`TB ${formatAmount(totals.avgCommissionPerOrder)}/đơn`}
            icon={<CoinIcon className="h-4 w-4" />}
          />
          <StatCard
            label="Phần vận hành"
            value={formatAmount(totals.operatorCommission)}
            tone="success"
            current={totals.operatorCommission}
            previous={previous.operatorCommission}
            hint={`trên ${formatAmount(totals.totalCommission)} Shopee trả`}
            icon={<TrendUpIcon className="h-4 w-4" />}
          />
          <StatCard
            label="Chưa chi trả"
            value={formatAmount(totals.unpaidAmount)}
            tone={totals.unpaidAmount > 0 ? "warning" : "muted"}
            current={totals.unpaidAmount}
            previous={previous.unpaidAmount}
            invertDelta
            hint={`đã trả ${formatAmount(totals.paidAmount)}`}
            icon={<WalletIcon className="h-4 w-4" />}
          />
          <StatCard
            label="Người dùng mới"
            value={totals.newUsers.toLocaleString("vi-VN")}
            current={totals.newUsers}
            previous={previous.newUsers}
            icon={<UserPlusIcon className="h-4 w-4" />}
          />
          <StatCard
            label="Khách phát sinh đơn"
            value={totals.buyers.toLocaleString("vi-VN")}
            current={totals.buyers}
            previous={previous.buyers}
            icon={<UsersIcon className="h-4 w-4" />}
          />
          <StatCard
            label="Đơn bị huỷ"
            value={totals.cancelledOrders.toLocaleString("vi-VN")}
            tone={totals.cancelledOrders > 0 ? "danger" : "muted"}
            current={totals.cancelledOrders}
            previous={previous.cancelledOrders}
            invertDelta
            hint={`${formatPct(share(totals.cancelledOrders, totals.orders))} tổng đơn`}
          />
          <StatCard
            label="Yêu cầu rút tiền"
            value={totals.withdrawals.toLocaleString("vi-VN")}
            current={totals.withdrawals}
            previous={previous.withdrawals}
            hint={formatAmount(totals.withdrawalAmount)}
          />
        </StatGrid>
      )}

      {data && (
        <>
          {/* Nhận xét nằm trên các biểu đồ vì đây là thứ người đọc báo cáo cần
              trước tiên; biểu đồ là phần để kiểm chứng lại nhận xét, và giờ nằm
              trong tab nên không còn đẩy phần chữ xuống cuối trang. */}
          <SectionCard title="Phân tích xu hướng" description="Đọc từ chính các số liệu trong kỳ, không phải dự báo.">
            <ul className="grid gap-2 md:grid-cols-2">
              {insights.map((insight, i) => (
                <li key={i} className={`rounded-lg border px-3 py-2 text-sm ${INSIGHT_TONE[insight.tone]}`}>
                  {insight.text}
                </li>
              ))}
              {!insights.length && <li className="text-sm text-[var(--muted)]">Chưa đủ dữ liệu để nhận xét.</li>}
            </ul>
          </SectionCard>

          <Tabs defaultSelectedKey="bieu-do">
            <Tabs.List aria-label="Nhóm biểu đồ báo cáo">
              <Tabs.Tab id="bieu-do">Biểu đồ theo ngày</Tabs.Tab>
              <Tabs.Tab id="co-cau">Cơ cấu &amp; xếp hạng</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel id="bieu-do" className="space-y-4">
              <SectionCard
                title="Dòng tiền theo ngày"
                description="Hoa hồng Shopee trả, phần hoàn cho khách và phần giữ lại vận hành. Chỉ tính đơn đã hoàn thành."
              >
                <TrendChart
                  labels={labels}
                  formatValue={moneyTick}
                  series={[
                    { key: "total", name: "Shopee trả", values: data.series.map((p) => p.totalCommission), area: true },
                    {
                      key: "user",
                      name: "Hoàn cho khách",
                      values: data.series.map((p) => p.userCommission),
                      color: "var(--success)",
                    },
                    {
                      key: "operator",
                      name: "Phần vận hành",
                      values: data.series.map((p) => p.operatorCommission),
                      color: "var(--warning)",
                    },
                  ]}
                />
              </SectionCard>

              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Đơn hàng theo ngày" description="Ghi nhận, hoàn thành và bị huỷ.">
                  <TrendChart
                    labels={labels}
                    height={200}
                    formatValue={(v) => String(Math.round(v))}
                    series={[
                      { key: "orders", name: "Ghi nhận", values: data.series.map((p) => p.orders), area: true },
                      {
                        key: "done",
                        name: "Hoàn thành",
                        values: data.series.map((p) => p.completedOrders),
                        color: "var(--success)",
                      },
                      {
                        key: "cancel",
                        name: "Bị huỷ",
                        values: data.series.map((p) => p.cancelledOrders),
                        color: "var(--danger)",
                      },
                    ]}
                  />
                </SectionCard>

                <SectionCard title="Người dùng & rút tiền" description="Tài khoản mới và số yêu cầu rút mỗi ngày.">
                  <TrendChart
                    labels={labels}
                    height={200}
                    formatValue={(v) => String(Math.round(v))}
                    series={[
                      { key: "users", name: "Người dùng mới", values: data.series.map((p) => p.newUsers), area: true },
                      {
                        key: "withdrawals",
                        name: "Yêu cầu rút",
                        values: data.series.map((p) => p.withdrawals),
                        color: "var(--warning)",
                      },
                    ]}
                  />
                </SectionCard>
              </div>
            </Tabs.Panel>

            <Tabs.Panel id="co-cau" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <SectionCard title="Tỉ trọng trạng thái đơn" className="lg:col-span-1">
                  <DonutChart
                    centerValue={String(data.totals.orders)}
                    centerLabel="đơn trong kỳ"
                    formatValue={(v) => String(Math.round(v))}
                    items={data.statusMix.map((s) => ({
                      label: displayStatusLabel(s.status),
                      value: s.orders,
                      color:
                        s.status === 2
                          ? "var(--success)"
                          : s.status === 3
                            ? "var(--danger)"
                            : s.status === 1
                              ? "var(--warning)"
                              : "var(--muted)",
                    }))}
                  />
                </SectionCard>

                <SectionCard
                  title="Sản phẩm hoàn tiền nhiều nhất"
                  description="Xếp theo tổng tiền hoàn cho khách."
                  className="lg:col-span-2"
                >
                  <BarList
                    formatValue={formatAmount}
                    items={data.topProducts.map((p) => ({
                      label: p.name,
                      value: p.userCommission,
                      sublabel: `${p.orders} đơn`,
                    }))}
                  />
                </SectionCard>
              </div>

              <SectionCard
                title="Khách hàng đóng góp nhiều nhất"
                description="Xếp theo tiền hoàn đã phát sinh trong kỳ."
              >
                <BarList
                  formatValue={formatAmount}
                  items={data.topCustomers.map((c) => ({
                    label: c.fullName || c.phone || c.email || `Người dùng #${c.userId}`,
                    value: c.userCommission,
                    sublabel: `${c.completedOrders}/${c.orders} đơn`,
                  }))}
                />
              </SectionCard>
            </Tabs.Panel>
          </Tabs>
        </>
      )}
    </div>
  );
}
