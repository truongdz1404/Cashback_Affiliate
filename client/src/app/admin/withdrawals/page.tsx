"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Chip, Table, toast } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatDateTime } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { datedFilename, downloadCsv } from "@/lib/exportCsv";
import { CopyIcon, DownloadIcon, RefreshIcon } from "@/components/icons";
import {
  DateRangeInput,
  EmptyState,
  ErrorBanner,
  FilterChips,
  Pagination,
  PageHeader,
  SearchInput,
  SelectFilter,
  StatCard,
  StatGrid,
  TableShell,
  Toolbar,
  type FilterOption,
} from "@/components/admin/ui";

type WithdrawalStatus = "pending" | "approved" | "rejected" | "paid";

type WithdrawalRequest = {
  id: number | string;
  userPhone?: string | null;
  userName?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountHolder?: string | null;
  amount: number;
  coinAmount?: number | null;
  method: string;
  status: WithdrawalStatus;
  createdAt?: string | null;
  processedAt?: string | null;
};

const STATUS_LABELS: Record<WithdrawalStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  paid: "Đã thanh toán",
};

const STATUS_COLORS: Record<WithdrawalStatus, "warning" | "accent" | "danger" | "success"> = {
  pending: "warning",
  approved: "accent",
  rejected: "danger",
  paid: "success",
};

const STATUS_OPTIONS: FilterOption[] = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "pending", label: "Chờ duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "rejected", label: "Từ chối" },
  { value: "paid", label: "Đã thanh toán" },
];

const SORT_OPTIONS: FilterOption[] = [
  { value: "newest", label: "Mới nhất" },
  { value: "oldest", label: "Cũ nhất" },
  { value: "amount_desc", label: "Số tiền giảm dần" },
  { value: "amount_asc", label: "Số tiền tăng dần" },
];

const EMPTY_FILTERS = { q: "", status: "", from: "", to: "", sort: "newest" };

function total(r: WithdrawalRequest) {
  return r.amount + (r.coinAmount || 0);
}

// The list endpoint returns every request in one go and there are not enough of
// them for that to hurt, so search, date window, sort and paging all happen
// here. Only the status filter goes to the server, because it is the one the
// API already indexes.
export default function WithdrawalsPage() {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<WithdrawalRequest["id"] | null>(null);

  const q = useDebounced(filters.q).trim().toLowerCase();

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    const qs = filters.status ? `?status=${filters.status}` : "";
    try {
      const data = await clientApi.get<WithdrawalRequest[]>(`/api/withdrawals${qs}`);
      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được yêu cầu thanh toán");
    } finally {
      setLoading(false);
    }
  }, [filters.status]);

  useEffect(() => {
    load();
  }, [load]);

  function setFilter<K extends keyof typeof EMPTY_FILTERS>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  }

  const filtered = useMemo(() => {
    const rows = requests.filter((r) => {
      if (q) {
        const haystack = [r.userPhone, r.userName, r.bankAccountNumber, r.bankAccountHolder, r.bankName, String(r.id)]
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
    const sorted = [...rows];
    switch (filters.sort) {
      case "oldest":
        sorted.sort((a, b) => Number(a.id) - Number(b.id));
        break;
      case "amount_desc":
        sorted.sort((a, b) => total(b) - total(a));
        break;
      case "amount_asc":
        sorted.sort((a, b) => total(a) - total(b));
        break;
      default:
        sorted.sort((a, b) => Number(b.id) - Number(a.id));
    }
    return sorted;
  }, [requests, q, filters.from, filters.to, filters.sort]);

  const pageRows = useMemo(
    () => filtered.slice(page * pageSize, page * pageSize + pageSize),
    [filtered, page, pageSize],
  );

  const summary = useMemo(() => {
    const sum = (rows: WithdrawalRequest[]) => rows.reduce((acc, r) => acc + total(r), 0);
    const pending = filtered.filter((r) => r.status === "pending");
    const approved = filtered.filter((r) => r.status === "approved");
    const paid = filtered.filter((r) => r.status === "paid");
    return {
      pendingCount: pending.length,
      pendingAmount: sum(pending),
      approvedCount: approved.length,
      approvedAmount: sum(approved),
      paidCount: paid.length,
      paidAmount: sum(paid),
      totalAmount: sum(filtered),
    };
  }, [filtered]);

  async function setStatus(request: WithdrawalRequest, status: WithdrawalStatus) {
    if (status === "paid" && !confirm(`Xác nhận đã chuyển ${formatAmount(total(request))} cho ${request.userPhone || `#${request.id}`}?`)) {
      return;
    }
    if (status === "rejected" && !confirm("Từ chối yêu cầu này? Xu sẽ được hoàn lại cho người dùng.")) return;
    setBusyId(request.id);
    try {
      await clientApi.put(`/api/withdrawals/${request.id}`, { status });
      toast.success(`Đã chuyển sang “${STATUS_LABELS[status]}”`);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Cập nhật thất bại";
      setError(message);
      toast.danger(message);
    } finally {
      setBusyId(null);
    }
  }

  async function copyAccount(r: WithdrawalRequest) {
    if (!r.bankAccountNumber) return;
    try {
      await navigator.clipboard.writeText(r.bankAccountNumber);
      toast.success("Đã chép số tài khoản");
    } catch {
      toast.danger("Trình duyệt không cho chép tự động");
    }
  }

  function exportRows() {
    downloadCsv(
      datedFilename("yeu-cau-rut-tien"),
      filtered,
      [
        { header: "ID", value: (r) => r.id },
        { header: "Khách hàng", value: (r) => r.userName || "" },
        { header: "Điện thoại", value: (r) => r.userPhone || "" },
        { header: "Ngân hàng", value: (r) => r.bankName || "" },
        { header: "Số tài khoản", value: (r) => r.bankAccountNumber || "" },
        { header: "Chủ tài khoản", value: (r) => r.bankAccountHolder || "" },
        { header: "Tiền hoàn", value: (r) => r.amount },
        { header: "Xu", value: (r) => r.coinAmount || 0 },
        { header: "Tổng chuyển", value: (r) => total(r) },
        { header: "Trạng thái", value: (r) => STATUS_LABELS[r.status] || r.status },
        { header: "Ngày tạo", value: (r) => formatDateTime(r.createdAt) },
      ],
    );
  }

  const chips = [
    filters.q && { label: `Tìm: ${filters.q}`, onClear: () => setFilter("q", "") },
    filters.status && {
      label: STATUS_LABELS[filters.status as WithdrawalStatus] ?? filters.status,
      onClear: () => setFilter("status", ""),
    },
    (filters.from || filters.to) && {
      label: `Ngày: ${filters.from || "…"} → ${filters.to || "…"}`,
      onClear: () => setFilters((prev) => ({ ...prev, from: "", to: "" })),
    },
  ].filter(Boolean) as { label: string; onClear: () => void }[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Yêu cầu rút tiền"
        count={filtered.length}
        description="Duyệt, từ chối và đánh dấu đã chuyển khoản."
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
        <StatCard
          label="Chờ duyệt"
          value={summary.pendingCount.toLocaleString("vi-VN")}
          hint={formatAmount(summary.pendingAmount)}
          tone="warning"
        />
        <StatCard
          label="Đã duyệt, chờ chuyển"
          value={summary.approvedCount.toLocaleString("vi-VN")}
          hint={formatAmount(summary.approvedAmount)}
          tone="accent"
        />
        <StatCard
          label="Đã thanh toán"
          value={summary.paidCount.toLocaleString("vi-VN")}
          hint={formatAmount(summary.paidAmount)}
          tone="success"
        />
        <StatCard label="Tổng tiền đang lọc" value={formatAmount(summary.totalAmount)} />
      </StatGrid>

      <Toolbar>
        <SearchInput
          value={filters.q}
          onChange={(v) => setFilter("q", v)}
          placeholder="Tìm theo tên, SĐT, số tài khoản…"
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
          className="min-w-[170px]"
        />
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            setFilters(EMPTY_FILTERS);
            setPage(0);
          }}
          isDisabled={!chips.length && filters.sort === "newest"}
        >
          Xoá lọc
        </Button>
      </Toolbar>

      <FilterChips items={chips} />

      <Card>
        <Card.Content className="space-y-4">
          <TableShell isLoading={loading}>
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Yêu cầu rút tiền" className="min-w-[1080px]">
                  <Table.Header>
                    <Table.Column isRowHeader>Khách hàng</Table.Column>
                    <Table.Column>Tài khoản nhận</Table.Column>
                    <Table.Column className="text-right">Tiền hoàn</Table.Column>
                    <Table.Column className="text-right">Xu</Table.Column>
                    <Table.Column className="text-right">Tổng chuyển</Table.Column>
                    <Table.Column>Trạng thái</Table.Column>
                    <Table.Column>Ngày tạo</Table.Column>
                    <Table.Column className="text-right">Thao tác</Table.Column>
                  </Table.Header>
                  <Table.Body
                    renderEmptyState={() => (
                      <EmptyState
                        title="Không có yêu cầu nào"
                        description="Thử bỏ bớt bộ lọc hoặc mở rộng khoảng ngày."
                      />
                    )}
                  >
                    {pageRows.map((r) => (
                      <Table.Row key={r.id}>
                        <Table.Cell>
                          <span className="block font-medium text-[var(--foreground)]">
                            {r.userName || r.userPhone || `#${r.id}`}
                          </span>
                          {r.userName && r.userPhone && (
                            <span className="block text-xs text-[var(--muted)]">{r.userPhone}</span>
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          {r.bankAccountNumber ? (
                            <div className="flex items-center gap-1.5">
                              <span className="min-w-0">
                                <span className="block font-mono text-sm text-[var(--foreground)]">
                                  {r.bankAccountNumber}
                                </span>
                                <span className="block truncate text-xs text-[var(--muted)]">
                                  {[r.bankName, r.bankAccountHolder].filter(Boolean).join(" · ") || r.method}
                                </span>
                              </span>
                              <button
                                type="button"
                                aria-label="Chép số tài khoản"
                                onClick={() => copyAccount(r)}
                                className="shrink-0 rounded-md p-1 text-[var(--muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
                              >
                                <CopyIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--danger)]">Chưa có tài khoản ngân hàng</span>
                          )}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">{formatAmount(r.amount)}</Table.Cell>
                        <Table.Cell className="text-right tabular-nums text-[var(--muted)]">
                          {r.coinAmount ? `${r.coinAmount.toLocaleString("vi-VN")} xu` : "-"}
                        </Table.Cell>
                        <Table.Cell className="text-right font-semibold tabular-nums">
                          {formatAmount(total(r))}
                        </Table.Cell>
                        <Table.Cell>
                          <Chip color={STATUS_COLORS[r.status] || "default"}>
                            {STATUS_LABELS[r.status] || r.status}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell className="text-[var(--muted)]">{formatDateTime(r.createdAt)}</Table.Cell>
                        <Table.Cell className="text-right">
                          <div className="flex justify-end gap-2">
                            {r.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onPress={() => setStatus(r, "approved")}
                                  isDisabled={busyId === r.id}
                                >
                                  Duyệt
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger-soft"
                                  onPress={() => setStatus(r, "rejected")}
                                  isDisabled={busyId === r.id}
                                >
                                  Từ chối
                                </Button>
                              </>
                            )}
                            {r.status === "approved" && (
                              <>
                                <Button
                                  size="sm"
                                  onPress={() => setStatus(r, "paid")}
                                  isDisabled={busyId === r.id}
                                >
                                  Đã chuyển khoản
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger-soft"
                                  onPress={() => setStatus(r, "rejected")}
                                  isDisabled={busyId === r.id}
                                >
                                  Từ chối
                                </Button>
                              </>
                            )}
                            {(r.status === "paid" || r.status === "rejected") && (
                              <span className="text-xs text-[var(--muted)]">
                                {r.processedAt ? formatDateTime(r.processedAt) : "Đã xử lý"}
                              </span>
                            )}
                          </div>
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
        Lưu ý: duyệt/đánh dấu đã thanh toán ở đây không tự động chuyển khoản — admin vẫn chuyển khoản thủ công. Số tiền
        cần chuyển là cột <strong>Tổng chuyển</strong> (tiền hoàn + xu, 1 xu = 1đ). Khi bấm{" "}
        <strong>Đã chuyển khoản</strong>, hệ thống tự đánh dấu các đơn hàng, thưởng giới thiệu và thưởng sự kiện tương
        ứng là đã trả — không cần vào trang Đơn hàng bấm tay từng dòng nữa. Từ chối một yêu cầu sẽ tự hoàn xu về cho
        người dùng.
      </p>
    </div>
  );
}
