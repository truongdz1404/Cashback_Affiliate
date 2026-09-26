"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Chip, Table } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatDateTime, displayStatusLabel } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { datedFilename, downloadCsv } from "@/lib/exportCsv";
import { DownloadIcon, RefreshIcon } from "@/components/icons";
import {
  DateRangeInput,
  EmptyState,
  ErrorBanner,
  FilterChips,
  PageHeader,
  Pagination,
  SearchInput,
  SelectFilter,
  StatCard,
  StatGrid,
  Toolbar,
  type FilterOption,
} from "@/components/admin/ui";

type Order = {
  id: number | string;
  orderSn: string;
  userPhone?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  zaloUserId?: string | null;
  productName?: string | null;
  displayOrderStatus: number;
  totalCommission?: number | null;
  userCommission?: number | null;
  operatorCommission?: number | null;
  payoutStatus: string;
  purchaseTime?: string | null;
};

const DISPLAY_FILTER_OPTIONS: FilterOption[] = [
  { value: "", label: "Mọi trạng thái Shopee" },
  { value: "1", label: "Đang chờ" },
  { value: "2", label: "Hoàn thành" },
  { value: "3", label: "Đã huỷ" },
  { value: "4", label: "Chưa thanh toán (Shopee)" },
];

const PAYOUT_FILTER_OPTIONS: FilterOption[] = [
  { value: "", label: "Mọi tình trạng chi trả" },
  { value: "paid", label: "Đã chi trả" },
  { value: "unpaid", label: "Chưa chi trả" },
  { value: "cancelled", label: "Đã huỷ chi trả" },
];

const SORT_OPTIONS: FilterOption[] = [
  { value: "newest", label: "Mới ghi nhận trước" },
  { value: "oldest", label: "Cũ ghi nhận trước" },
  { value: "purchase_desc", label: "Ngày mua mới nhất" },
  { value: "purchase_asc", label: "Ngày mua cũ nhất" },
  { value: "commission_desc", label: "Hoa hồng cao nhất" },
  { value: "commission_asc", label: "Hoa hồng thấp nhất" },
];

const EMPTY_FILTERS = { q: "", displayStatus: "", payoutStatus: "", from: "", to: "", sort: "newest" };

function customerLabel(o: Order): string {
  return o.userName || o.userPhone || o.userEmail || o.zaloUserId || "Khách vãng lai";
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<Order["id"] | null>(null);

  const q = useDebounced(filters.q);

  const params = useMemo(() => {
    const p = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
    if (q.trim()) p.set("q", q.trim());
    if (filters.displayStatus) p.set("displayStatus", filters.displayStatus);
    if (filters.payoutStatus) p.set("payoutStatus", filters.payoutStatus);
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    if (filters.sort && filters.sort !== "newest") p.set("sort", filters.sort);
    return p;
  }, [pageSize, page, q, filters.displayStatus, filters.payoutStatus, filters.from, filters.to, filters.sort]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await clientApi.get<{ orders: Order[]; total: number }>(`/api/orders?${params.toString()}`);
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được đơn hàng");
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  // Any filter change puts you back on page 1 - staying on page 7 of a result
  // set that now has two pages shows an empty table and looks like a bug.
  function setFilter(patch: Partial<typeof EMPTY_FILTERS>) {
    setPage(0);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  async function togglePayout(order: Order) {
    setBusyId(order.id);
    try {
      await clientApi.put(`/api/orders/${order.id}/payout`, { paid: order.payoutStatus !== "paid" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật thất bại");
    } finally {
      setBusyId(null);
    }
  }

  // Exports the page in front of you, not the whole table: pulling every order
  // ever placed would be a second, much heavier query, and the filters are
  // there precisely so you can narrow down to what you meant to export.
  function exportPage() {
    downloadCsv(datedFilename("don-hang"), orders, [
      { header: "Mã đơn", value: (o) => o.orderSn },
      { header: "Khách hàng", value: (o) => customerLabel(o) },
      { header: "Điện thoại", value: (o) => o.userPhone ?? "" },
      { header: "Sản phẩm", value: (o) => o.productName ?? "" },
      { header: "Trạng thái Shopee", value: (o) => displayStatusLabel(o.displayOrderStatus) },
      { header: "Hoa hồng khách", value: (o) => o.userCommission ?? 0 },
      { header: "Hoa hồng vận hành", value: (o) => o.operatorCommission ?? 0 },
      { header: "Chi trả", value: (o) => (o.payoutStatus === "paid" ? "Đã trả" : "Chưa trả") },
      { header: "Ngày mua", value: (o) => formatDateTime(o.purchaseTime) },
    ]);
  }

  const activeChips = [
    filters.q && { label: `Từ khoá: ${filters.q}`, onClear: () => setFilter({ q: "" }) },
    filters.displayStatus && {
      label: displayStatusLabel(filters.displayStatus),
      onClear: () => setFilter({ displayStatus: "" }),
    },
    filters.payoutStatus && {
      label: PAYOUT_FILTER_OPTIONS.find((o) => o.value === filters.payoutStatus)?.label ?? "",
      onClear: () => setFilter({ payoutStatus: "" }),
    },
    (filters.from || filters.to) && {
      label: `Ngày mua: ${filters.from || "…"} → ${filters.to || "…"}`,
      onClear: () => setFilter({ from: "", to: "" }),
    },
  ].filter(Boolean) as { label: string; onClear: () => void }[];

  // Page-level roll-up, so the numbers under the filters answer for what is on
  // screen rather than for the whole database.
  const pageTotals = useMemo(() => {
    const completed = orders.filter((o) => o.displayOrderStatus === 2);
    return {
      user: completed.reduce((s, o) => s + (o.userCommission ?? 0), 0),
      operator: completed.reduce((s, o) => s + (o.operatorCommission ?? 0), 0),
      unpaid: completed
        .filter((o) => o.payoutStatus !== "paid")
        .reduce((s, o) => s + (o.userCommission ?? 0), 0),
      completed: completed.length,
    };
  }, [orders]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Đơn hàng"
        count={total}
        description="Đơn Shopee đã đối soát về, kèm tình trạng chi trả hoa hồng cho khách."
        actions={
          <>
            <Button size="sm" variant="outline" onPress={load} isDisabled={loading}>
              <RefreshIcon className="h-4 w-4" />
              Làm mới
            </Button>
            <Button size="sm" variant="outline" onPress={exportPage} isDisabled={!orders.length}>
              <DownloadIcon className="h-4 w-4" />
              Xuất trang này
            </Button>
          </>
        }
      />

      <Toolbar>
        <SearchInput
          value={filters.q}
          onChange={(v) => setFilter({ q: v })}
          placeholder="Mã đơn, sản phẩm, SĐT, email…"
        />
        <SelectFilter
          label="Lọc theo trạng thái Shopee"
          value={filters.displayStatus}
          options={DISPLAY_FILTER_OPTIONS}
          onChange={(v) => setFilter({ displayStatus: v })}
          className="min-w-[200px]"
        />
        <SelectFilter
          label="Lọc theo tình trạng chi trả"
          value={filters.payoutStatus}
          options={PAYOUT_FILTER_OPTIONS}
          onChange={(v) => setFilter({ payoutStatus: v })}
          className="min-w-[190px]"
        />
        <DateRangeInput
          from={filters.from}
          to={filters.to}
          onChange={({ from, to }) => setFilter({ from, to })}
        />
        <SelectFilter
          label="Sắp xếp"
          value={filters.sort}
          options={SORT_OPTIONS}
          onChange={(v) => setFilter({ sort: v })}
          className="min-w-[190px]"
        />
        {activeChips.length > 0 && (
          <Button size="sm" variant="ghost" onPress={() => setFilter(EMPTY_FILTERS)}>
            Xoá lọc
          </Button>
        )}
      </Toolbar>

      <FilterChips items={activeChips} />

      <ErrorBanner message={error} onRetry={load} />

      <StatGrid>
        <StatCard label="Đơn hoàn thành (trang này)" value={pageTotals.completed.toLocaleString("vi-VN")} />
        <StatCard label="Hoàn cho khách" value={formatAmount(pageTotals.user)} tone="accent" />
        <StatCard label="Phần vận hành" value={formatAmount(pageTotals.operator)} tone="success" />
        <StatCard
          label="Chưa chi trả"
          value={formatAmount(pageTotals.unpaid)}
          tone={pageTotals.unpaid > 0 ? "warning" : "muted"}
        />
      </StatGrid>

      <Card>
        <Card.Content className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Đơn hàng" className="min-w-[1040px]">
                <Table.Header>
                  <Table.Column isRowHeader>Mã đơn</Table.Column>
                  <Table.Column>Khách hàng</Table.Column>
                  <Table.Column>Sản phẩm</Table.Column>
                  <Table.Column>Trạng thái Shopee</Table.Column>
                  <Table.Column className="text-right">Hoa hồng khách</Table.Column>
                  <Table.Column className="text-right">Hoa hồng vận hành</Table.Column>
                  <Table.Column>Chi trả</Table.Column>
                  <Table.Column>Ngày mua</Table.Column>
                  <Table.Column className="text-right">Thao tác</Table.Column>
                </Table.Header>
                <Table.Body
                  renderEmptyState={() => (
                    <EmptyState
                      title="Không có đơn nào khớp bộ lọc"
                      description="Thử bỏ bớt điều kiện lọc hoặc mở rộng khoảng ngày."
                    />
                  )}
                >
                  {orders.map((o) => (
                    <Table.Row key={o.id}>
                      <Table.Cell className="font-mono text-xs">{o.orderSn}</Table.Cell>
                      <Table.Cell>
                        <span className="block max-w-[160px] truncate" title={customerLabel(o)}>
                          {customerLabel(o)}
                        </span>
                      </Table.Cell>
                      <Table.Cell className="text-[var(--muted)]">
                        <span className="block max-w-[220px] truncate" title={o.productName ?? ""}>
                          {o.productName || "-"}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <Chip
                          color={
                            o.displayOrderStatus === 2 ? "success" : o.displayOrderStatus === 3 ? "danger" : "default"
                          }
                        >
                          {displayStatusLabel(o.displayOrderStatus)}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">{formatAmount(o.userCommission)}</Table.Cell>
                      <Table.Cell className="text-right tabular-nums text-[var(--muted)]">
                        {formatAmount(o.operatorCommission)}
                      </Table.Cell>
                      <Table.Cell>
                        <Chip
                          color={
                            o.payoutStatus === "paid" ? "success" : o.payoutStatus === "cancelled" ? "danger" : "warning"
                          }
                        >
                          {o.payoutStatus === "paid" ? "Đã trả" : o.payoutStatus === "cancelled" ? "Huỷ" : "Chưa trả"}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap text-[var(--muted)]">
                        {formatDateTime(o.purchaseTime)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {o.displayOrderStatus === 2 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onPress={() => togglePayout(o)}
                            isDisabled={busyId === o.id}
                          >
                            {o.payoutStatus === "paid" ? "Đánh dấu chưa trả" : "Đánh dấu đã trả"}
                          </Button>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card.Content>
      </Card>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        onPageSize={(size) => {
          setPage(0);
          setPageSize(size);
        }}
      />
    </div>
  );
}
