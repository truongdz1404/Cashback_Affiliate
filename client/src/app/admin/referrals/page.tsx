"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Chip, Table, toast } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatDateTime, formatPct } from "@/lib/format";
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
  SectionCard,
  SelectFilter,
  StatCard,
  StatGrid,
  TableShell,
  Toolbar,
  type FilterOption,
} from "@/components/admin/ui";

type PayoutStatus = "unpaid" | "paid" | "revoked";

type Party = { phone?: string | null; email?: string | null; fullName?: string | null };

type ReferralCommissionRow = {
  id: number;
  referralId: number;
  referrerUserId: number;
  referredUserId: number;
  orderId: number;
  pct: number;
  baseAmount: number;
  amount: number;
  payoutStatus: PayoutStatus;
  paidAt: string | null;
  createdAt: string | null;
  referrer: Party;
  referred: Party;
  order: { orderSn: string; productName: string | null; displayOrderStatus: number | null; payoutStatus: string };
};

const STATUS_LABELS: Record<PayoutStatus, string> = {
  unpaid: "Chưa thanh toán",
  paid: "Đã thanh toán",
  revoked: "Đã thu hồi",
};

const STATUS_COLORS: Record<PayoutStatus, "warning" | "success" | "danger"> = {
  unpaid: "warning",
  paid: "success",
  revoked: "danger",
};

const STATUS_OPTIONS: FilterOption[] = [
  { value: "unpaid", label: "Chưa thanh toán" },
  { value: "paid", label: "Đã thanh toán" },
  { value: "revoked", label: "Đã thu hồi" },
  { value: "", label: "Tất cả" },
];

const SORT_OPTIONS: FilterOption[] = [
  { value: "newest", label: "Mới nhất" },
  { value: "oldest", label: "Cũ nhất" },
  { value: "amount_desc", label: "Hoa hồng cao nhất" },
  { value: "amount_asc", label: "Hoa hồng thấp nhất" },
];

const DEFAULTS = { q: "", status: "unpaid", from: "", to: "", sort: "newest" };

function who(p: Party | null | undefined, id: number) {
  if (!p) return `#${id}`;
  return p.phone || p.email || p.fullName || `#${id}`;
}

function PartyCell({ party, id }: { party: Party; id: number }) {
  const secondary = [party.fullName, party.phone ? party.email : null].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-[var(--foreground)]">{who(party, id)}</span>
      {secondary && <span className="text-xs text-[var(--muted)]">{secondary}</span>}
    </div>
  );
}

export default function ReferralsPage() {
  const [rows, setRows] = useState<ReferralCommissionRow[]>([]);
  const [filters, setFilters] = useState(DEFAULTS);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const q = useDebounced(filters.q).trim().toLowerCase();

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    const qs = filters.status ? `?payoutStatus=${filters.status}&limit=500` : "?limit=500";
    try {
      const data = await clientApi.get<ReferralCommissionRow[]>(`/api/referral-commissions${qs}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được hoa hồng giới thiệu");
    } finally {
      setLoading(false);
    }
  }, [filters.status]);

  useEffect(() => {
    load();
  }, [load]);

  function setFilter<K extends keyof typeof DEFAULTS>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  }

  const filtered = useMemo(() => {
    const kept = rows.filter((r) => {
      if (q) {
        const haystack = [
          r.referrer?.phone,
          r.referrer?.email,
          r.referrer?.fullName,
          r.referred?.phone,
          r.referred?.email,
          r.referred?.fullName,
          r.order?.orderSn,
          r.order?.productName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.from || filters.to) {
        const day = (r.createdAt || "").slice(0, 10);
        if (!day) return false;
        if (filters.from && day < filters.from) return false;
        if (filters.to && day > filters.to) return false;
      }
      return true;
    });
    const sorted = [...kept];
    switch (filters.sort) {
      case "oldest":
        sorted.sort((a, b) => a.id - b.id);
        break;
      case "amount_desc":
        sorted.sort((a, b) => b.amount - a.amount);
        break;
      case "amount_asc":
        sorted.sort((a, b) => a.amount - b.amount);
        break;
      default:
        sorted.sort((a, b) => b.id - a.id);
    }
    return sorted;
  }, [rows, q, filters.from, filters.to, filters.sort]);

  const pageRows = useMemo(
    () => filtered.slice(page * pageSize, page * pageSize + pageSize),
    [filtered, page, pageSize],
  );

  // Per-referrer subtotal of what is on screen - the number the admin
  // actually transfers when clearing the unpaid queue for one person.
  const byReferrer = useMemo(() => {
    const map = new Map<number, { label: string; total: number; count: number }>();
    for (const r of filtered) {
      const cur = map.get(r.referrerUserId) || { label: who(r.referrer, r.referrerUserId), total: 0, count: 0 };
      cur.total += r.amount;
      cur.count += 1;
      map.set(r.referrerUserId, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  const total = filtered.reduce((sum, r) => sum + r.amount, 0);
  const baseTotal = filtered.reduce((sum, r) => sum + r.baseAmount, 0);

  async function markPaid(row: ReferralCommissionRow) {
    const ok = window.confirm(
      `Đánh dấu đã thanh toán ${formatAmount(row.amount)} hoa hồng giới thiệu cho ${who(row.referrer, row.referrerUserId)}? Chỉ làm sau khi đã chuyển khoản.`,
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await clientApi.put(`/api/referral-commissions/${row.id}/payout`, {});
      toast.success("Đã đánh dấu thanh toán");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Cập nhật thất bại";
      setError(message);
      toast.danger(message);
    } finally {
      setBusyId(null);
    }
  }

  function exportRows() {
    downloadCsv(
      datedFilename("hoa-hong-gioi-thieu"),
      filtered,
      [
        { header: "ID", value: (r) => r.id },
        { header: "Người giới thiệu", value: (r) => who(r.referrer, r.referrerUserId) },
        { header: "Người được giới thiệu", value: (r) => who(r.referred, r.referredUserId) },
        { header: "Mã đơn", value: (r) => r.order?.orderSn || "" },
        { header: "Sản phẩm", value: (r) => r.order?.productName || "" },
        { header: "Hoàn tiền gốc", value: (r) => r.baseAmount },
        { header: "%", value: (r) => r.pct },
        { header: "Hoa hồng", value: (r) => r.amount },
        { header: "Trạng thái", value: (r) => STATUS_LABELS[r.payoutStatus] || r.payoutStatus },
        { header: "Ghi nhận", value: (r) => formatDateTime(r.createdAt) },
        { header: "Thanh toán lúc", value: (r) => formatDateTime(r.paidAt) },
      ],
    );
  }

  const chips = [
    filters.q && { label: `Tìm: ${filters.q}`, onClear: () => setFilter("q", "") },
    (filters.from || filters.to) && {
      label: `Ngày: ${filters.from || "…"} → ${filters.to || "…"}`,
      onClear: () => setFilters((prev) => ({ ...prev, from: "", to: "" })),
    },
  ].filter(Boolean) as { label: string; onClear: () => void }[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Hoa hồng giới thiệu"
        count={filtered.length}
        description="Mỗi đơn hoàn thành của người được giới thiệu tạo một dòng hoa hồng cho người giới thiệu."
        actions={
          <>
            <Button variant="outline" onPress={exportRows} isDisabled={!filtered.length}>
              <DownloadIcon className="h-4 w-4" />
              Xuất CSV
            </Button>
            <Button variant="outline" onPress={load} isDisabled={loading}>
              <RefreshIcon className="h-4 w-4" />
              Làm mới
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} onRetry={load} />

      <StatGrid>
        <StatCard label="Số dòng đang lọc" value={filtered.length.toLocaleString("vi-VN")} />
        <StatCard
          label="Tổng hoa hồng"
          value={formatAmount(total)}
          tone={filters.status === "unpaid" ? "warning" : "accent"}
          hint={filters.status === "unpaid" ? "cần chuyển khoản" : undefined}
        />
        <StatCard label="Người giới thiệu" value={byReferrer.length.toLocaleString("vi-VN")} />
        <StatCard label="Hoàn tiền gốc của người được mời" value={formatAmount(baseTotal)} tone="muted" />
      </StatGrid>

      <Toolbar>
        <SearchInput
          value={filters.q}
          onChange={(v) => setFilter("q", v)}
          placeholder="Tìm theo người giới thiệu, người được mời, mã đơn…"
        />
        <SelectFilter
          label="Trạng thái"
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(v) => setFilter("status", v)}
        />
        <DateRangeInput
          from={filters.from}
          to={filters.to}
          onChange={(next) => {
            setFilters((prev) => ({ ...prev, ...next }));
            setPage(0);
          }}
        />
        <SelectFilter
          label="Sắp xếp"
          value={filters.sort}
          options={SORT_OPTIONS}
          onChange={(v) => setFilter("sort", v)}
          className="min-w-[180px]"
        />
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            setFilters(DEFAULTS);
            setPage(0);
          }}
          isDisabled={!chips.length && filters.sort === "newest" && filters.status === "unpaid"}
        >
          Xoá lọc
        </Button>
      </Toolbar>

      <FilterChips items={chips} />

      {filters.status === "unpaid" && byReferrer.length > 0 && (
        <SectionCard
          title="Cần chuyển theo người giới thiệu"
          description="Tổng chưa thanh toán gộp theo từng người, để chuyển khoản một lần rồi đánh dấu từng dòng bên dưới."
        >
          <ul className="flex flex-wrap gap-2">
            {byReferrer.map(([id, v]) => (
              <li
                key={id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 text-sm"
              >
                <span className="font-semibold text-[var(--foreground)]">{v.label}</span>
                <span className="text-[var(--muted)]"> · {v.count} đơn · </span>
                <span className="font-semibold tabular-nums text-[var(--warning)]">{formatAmount(v.total)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <Card>
        <Card.Content className="space-y-4">
          <TableShell isLoading={loading}>
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Hoa hồng giới thiệu" className="min-w-[1080px]">
                  <Table.Header>
                    <Table.Column isRowHeader>Người giới thiệu</Table.Column>
                    <Table.Column>Người được giới thiệu</Table.Column>
                    <Table.Column>Đơn hàng</Table.Column>
                    <Table.Column className="text-right">Hoàn tiền của bạn được mời</Table.Column>
                    <Table.Column className="text-right">%</Table.Column>
                    <Table.Column className="text-right">Hoa hồng</Table.Column>
                    <Table.Column>Trạng thái</Table.Column>
                    <Table.Column>Ghi nhận</Table.Column>
                    <Table.Column className="text-right">Thao tác</Table.Column>
                  </Table.Header>
                  <Table.Body
                    renderEmptyState={() => (
                      <EmptyState
                        title="Không có hoa hồng giới thiệu nào"
                        description="Thử đổi trạng thái hoặc mở rộng khoảng ngày."
                      />
                    )}
                  >
                    {pageRows.map((r) => (
                      <Table.Row key={r.id}>
                        <Table.Cell>
                          <PartyCell party={r.referrer} id={r.referrerUserId} />
                        </Table.Cell>
                        <Table.Cell>
                          <PartyCell party={r.referred} id={r.referredUserId} />
                        </Table.Cell>
                        <Table.Cell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs">{r.order.orderSn}</span>
                            {r.order.productName && (
                              <span className="block max-w-[240px] truncate text-xs text-[var(--muted)]">
                                {r.order.productName}
                              </span>
                            )}
                          </div>
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums text-[var(--muted)]">
                          {formatAmount(r.baseAmount)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums text-[var(--muted)]">
                          {formatPct(r.pct)}
                        </Table.Cell>
                        <Table.Cell className="text-right font-semibold tabular-nums">
                          {formatAmount(r.amount)}
                        </Table.Cell>
                        <Table.Cell>
                          <Chip color={STATUS_COLORS[r.payoutStatus] || "default"}>
                            {STATUS_LABELS[r.payoutStatus] || r.payoutStatus}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell className="text-[var(--muted)]">
                          {formatDateTime(r.payoutStatus === "paid" ? r.paidAt : r.createdAt)}
                        </Table.Cell>
                        <Table.Cell className="text-right">
                          {r.payoutStatus === "unpaid" && (
                            <Button size="sm" variant="outline" onPress={() => markPaid(r)} isDisabled={busyId === r.id}>
                              Đánh dấu đã thanh toán
                            </Button>
                          )}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </TableShell>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPage={setPage}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(0);
            }}
          />
        </Card.Content>
      </Card>

      <p className="text-xs text-[var(--muted)]">
        Lưu ý: hoa hồng chưa thanh toán đã được tính vào số dư khả dụng của người giới thiệu. Khi họ rút tiền, admin
        chuyển khoản thủ công rồi đánh dấu các dòng tương ứng ở đây. Đơn bị Shopee huỷ sẽ tự chuyển sang &quot;Đã thu
        hồi&quot; nếu chưa trả; nếu đã trả, hệ thống ghi cờ thu hồi để xử lý tay. % và thời hạn chỉnh ở trang Cài đặt.
      </p>
    </div>
  );
}
