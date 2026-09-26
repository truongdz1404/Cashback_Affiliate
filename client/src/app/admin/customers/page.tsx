"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Chip, Input, Table } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { datedFilename, downloadCsv } from "@/lib/exportCsv";
import { DownloadIcon, RefreshIcon } from "@/components/icons";
import {
  EmptyState,
  ErrorBanner,
  FilterChips,
  PageHeader,
  Pagination,
  SearchInput,
  SelectFilter,
  StatCard,
  StatGrid,
  TableShell,
  Toolbar,
  type FilterOption,
} from "@/components/admin/ui";

type Customer = {
  userId: number | string;
  phone?: string | null;
  email?: string | null;
  fullName?: string | null;
  role?: "user" | "admin" | null;
  zaloUserId?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountHolder?: string | null;
  commissionPct?: number | null;
  paidOrders: number;
  paidAmount: number;
  unpaidOrders: number;
  unpaidAmount: number;
  pendingOrders: number;
};

type CustomerForm = {
  phone: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  commissionPct: string;
};

// The backend's refusal messages (api/server.js, PUT
// /admin/users/:id/role) are English; anything not listed here is shown as-is.
const ROLE_ERRORS: Record<string, string> = {
  "you cannot remove your own admin role": "Bạn không thể tự gỡ quyền quản trị của chính mình.",
  "cannot demote the last remaining admin": "Không thể gỡ quyền của quản trị viên cuối cùng.",
  "admin role required": "Tài khoản của bạn không còn quyền quản trị.",
};

const ROLE_OPTIONS: FilterOption[] = [
  { value: "", label: "Mọi vai trò" },
  { value: "admin", label: "Quản trị viên" },
  { value: "user", label: "Người dùng" },
];

const FLAG_OPTIONS: FilterOption[] = [
  { value: "", label: "Mọi khách hàng" },
  { value: "debt", label: "Đang còn nợ" },
  { value: "pending", label: "Có đơn đang chờ" },
  { value: "noBank", label: "Chưa có tài khoản NH" },
  { value: "customPct", label: "% hoa hồng riêng" },
];

const SORT_OPTIONS: FilterOption[] = [
  { value: "unpaid_desc", label: "Còn nợ nhiều nhất" },
  { value: "paid_desc", label: "Đã trả nhiều nhất" },
  { value: "orders_desc", label: "Nhiều đơn nhất" },
  { value: "newest", label: "Mới nhất" },
];

const EMPTY_FILTERS = { q: "", role: "", flag: "", sort: "unpaid_desc" };

// Grant/revoke the dashboard. The backend owns the guard rails (no
// self-demotion, never demote the last admin) and its message is shown
// under the button when it refuses.
function RoleToggle({ customer, onSaved }: { customer: Customer; onSaved: () => void }) {
  const isAdmin = customer.role === "admin";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    const who = customer.fullName || customer.email || customer.phone || `#${customer.userId}`;
    const question = isAdmin
      ? `Gỡ quyền quản trị của ${who}? Người này sẽ không còn thấy trang quản trị nữa.`
      : `Cấp quyền quản trị cho ${who}? Người này sẽ thấy và dùng được toàn bộ trang quản trị.`;
    if (!window.confirm(question)) return;
    setPending(true);
    setError("");
    try {
      await clientApi.put(`/api/users/${customer.userId}/role`, { role: isAdmin ? "user" : "admin" });
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(ROLE_ERRORS[message] || message || "Không đổi được quyền");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant={isAdmin ? "danger-soft" : "secondary"} onPress={toggle} isPending={pending}>
        {isAdmin ? "Gỡ quyền admin" : "Cấp quyền admin"}
      </Button>
      {error && <p className="max-w-[12rem] text-right text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}

function IdentityCell({ customer }: { customer: Customer }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 font-medium text-[var(--foreground)]">
        {customer.phone || <span className="font-normal text-[var(--muted)]">Chưa có SĐT</span>}
        {customer.role === "admin" && (
          <Chip size="sm" color="accent">
            Admin
          </Chip>
        )}
      </span>
      {(customer.fullName || customer.email) && (
        <span className="text-xs text-[var(--muted)]">
          {[customer.fullName, customer.email].filter(Boolean).join(" · ")}
        </span>
      )}
    </div>
  );
}

function EditableRow({ customer, onSaved }: { customer: Customer; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CustomerForm>({
    phone: customer.phone || "",
    bankName: customer.bankName || "",
    bankAccountNumber: customer.bankAccountNumber || "",
    bankAccountHolder: customer.bankAccountHolder || "",
    commissionPct: customer.commissionPct != null ? String(customer.commissionPct) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await clientApi.put(`/api/users/${customer.userId}`, {
        phone: form.phone || undefined,
        bankName: form.bankName || undefined,
        bankAccountNumber: form.bankAccountNumber || undefined,
        bankAccountHolder: form.bankAccountHolder || undefined,
      });
      await clientApi.put(`/api/users/${customer.userId}/commission-pct`, {
        commissionPct: form.commissionPct === "" ? null : Number(form.commissionPct),
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Table.Row>
        <Table.Cell>
          <IdentityCell customer={customer} />
        </Table.Cell>
        <Table.Cell>
          {customer.bankAccountNumber ? (
            <span className="flex flex-col gap-0.5">
              <span className="font-mono text-sm text-[var(--foreground)]">{customer.bankAccountNumber}</span>
              <span className="text-xs text-[var(--muted)]">
                {[customer.bankName, customer.bankAccountHolder].filter(Boolean).join(" · ")}
              </span>
            </span>
          ) : (
            <span className="text-xs text-[var(--muted)]">Chưa có</span>
          )}
        </Table.Cell>
        <Table.Cell>
          {customer.commissionPct !== null && customer.commissionPct !== undefined ? (
            <Chip size="sm" color="accent">{customer.commissionPct}%</Chip>
          ) : (
            <span className="text-xs text-[var(--muted)]">Mặc định</span>
          )}
        </Table.Cell>
        <Table.Cell className="text-right tabular-nums text-[var(--success)]">
          {customer.paidOrders} đơn · {formatAmount(customer.paidAmount)}
        </Table.Cell>
        <Table.Cell className="text-right tabular-nums text-[var(--warning)]">
          {customer.unpaidOrders} đơn · {formatAmount(customer.unpaidAmount)}
        </Table.Cell>
        <Table.Cell className="text-center">
          {customer.pendingOrders ? (
            <Chip color="accent">{customer.pendingOrders} đang chờ</Chip>
          ) : (
            <span className="text-xs text-[var(--muted)]">—</span>
          )}
        </Table.Cell>
        <Table.Cell className="text-right">
          <Button size="sm" variant="outline" onPress={() => setEditing(true)}>
            Sửa
          </Button>
        </Table.Cell>
        <Table.Cell className="text-right">
          <RoleToggle customer={customer} onSaved={onSaved} />
        </Table.Cell>
      </Table.Row>
    );
  }

  return (
    <Table.Row className="bg-[var(--accent-soft)]">
      <Table.Cell>
        <Input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="w-28"
          placeholder="SĐT"
        />
      </Table.Cell>
      <Table.Cell>
        <div className="flex flex-col gap-1">
          <Input
            value={form.bankName}
            onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
            placeholder="Ngân hàng"
          />
          <Input
            value={form.bankAccountNumber}
            onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
            placeholder="Số tài khoản"
          />
          <Input
            value={form.bankAccountHolder}
            onChange={(e) => setForm((f) => ({ ...f, bankAccountHolder: e.target.value }))}
            placeholder="Chủ tài khoản"
          />
        </div>
      </Table.Cell>
      <Table.Cell>
        <Input
          value={form.commissionPct}
          onChange={(e) => setForm((f) => ({ ...f, commissionPct: e.target.value }))}
          className="w-20"
          placeholder="% mặc định"
        />
      </Table.Cell>
      <Table.Cell className="text-right tabular-nums text-[var(--success)]">
        {customer.paidOrders} đơn · {formatAmount(customer.paidAmount)}
      </Table.Cell>
      <Table.Cell className="text-right tabular-nums text-[var(--warning)]">
        {customer.unpaidOrders} đơn · {formatAmount(customer.unpaidAmount)}
      </Table.Cell>
      <Table.Cell className="text-center">
        {customer.pendingOrders ? (
          <Chip color="accent">{customer.pendingOrders} đang chờ</Chip>
        ) : (
          <span className="text-xs text-[var(--muted)]">—</span>
        )}
      </Table.Cell>
      <Table.Cell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" onPress={save} isPending={saving}>
            Lưu
          </Button>
          <Button size="sm" variant="tertiary" onPress={() => setEditing(false)} isDisabled={saving}>
            Huỷ
          </Button>
        </div>
        {error && <p className="mt-1 text-right text-xs text-[var(--danger)]">{error}</p>}
      </Table.Cell>
      <Table.Cell className="text-right">
        <RoleToggle customer={customer} onSaved={onSaved} />
      </Table.Cell>
    </Table.Row>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const q = useDebounced(filters.q).trim().toLowerCase();

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await clientApi.get<Customer[]>("/api/customers");
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách khách hàng");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setFilter<K extends keyof typeof EMPTY_FILTERS>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  }

  const filtered = useMemo(() => {
    const rows = customers.filter((c) => {
      if (q) {
        const haystack = [c.phone, c.email, c.fullName, c.bankAccountNumber, c.bankAccountHolder, c.zaloUserId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.role && (c.role || "user") !== filters.role) return false;
      if (filters.flag === "debt" && c.unpaidAmount <= 0) return false;
      if (filters.flag === "pending" && !c.pendingOrders) return false;
      if (filters.flag === "noBank" && c.bankAccountNumber) return false;
      if (filters.flag === "customPct" && (c.commissionPct === null || c.commissionPct === undefined)) return false;
      return true;
    });
    const sorted = [...rows];
    switch (filters.sort) {
      case "paid_desc":
        sorted.sort((a, b) => b.paidAmount - a.paidAmount);
        break;
      case "orders_desc":
        sorted.sort(
          (a, b) =>
            b.paidOrders + b.unpaidOrders + b.pendingOrders - (a.paidOrders + a.unpaidOrders + a.pendingOrders),
        );
        break;
      case "newest":
        sorted.sort((a, b) => Number(b.userId) - Number(a.userId));
        break;
      default:
        sorted.sort((a, b) => b.unpaidAmount - a.unpaidAmount);
    }
    return sorted;
  }, [customers, q, filters.role, filters.flag, filters.sort]);

  const pageRows = useMemo(
    () => filtered.slice(page * pageSize, page * pageSize + pageSize),
    [filtered, page, pageSize],
  );

  const summary = useMemo(
    () => ({
      count: filtered.length,
      withOrders: filtered.filter((c) => c.paidOrders + c.unpaidOrders + c.pendingOrders > 0).length,
      unpaidAmount: filtered.reduce((sum, c) => sum + c.unpaidAmount, 0),
      paidAmount: filtered.reduce((sum, c) => sum + c.paidAmount, 0),
      noBank: filtered.filter((c) => !c.bankAccountNumber).length,
    }),
    [filtered],
  );

  function exportRows() {
    downloadCsv(
      datedFilename("khach-hang"),
      filtered,
      [
        { header: "ID", value: (c) => c.userId },
        { header: "Họ tên", value: (c) => c.fullName || "" },
        { header: "Điện thoại", value: (c) => c.phone || "" },
        { header: "Email", value: (c) => c.email || "" },
        { header: "Vai trò", value: (c) => (c.role === "admin" ? "Quản trị" : "Người dùng") },
        { header: "Ngân hàng", value: (c) => c.bankName || "" },
        { header: "Số tài khoản", value: (c) => c.bankAccountNumber || "" },
        { header: "Chủ tài khoản", value: (c) => c.bankAccountHolder || "" },
        { header: "% hoa hồng", value: (c) => (c.commissionPct ?? "") },
        { header: "Đơn đã trả", value: (c) => c.paidOrders },
        { header: "Tiền đã trả", value: (c) => c.paidAmount },
        { header: "Đơn còn nợ", value: (c) => c.unpaidOrders },
        { header: "Tiền còn nợ", value: (c) => c.unpaidAmount },
        { header: "Đơn đang chờ", value: (c) => c.pendingOrders },
      ],
    );
  }

  const chips = [
    filters.q && { label: `Tìm: ${filters.q}`, onClear: () => setFilter("q", "") },
    filters.role && {
      label: ROLE_OPTIONS.find((o) => o.value === filters.role)!.label,
      onClear: () => setFilter("role", ""),
    },
    filters.flag && {
      label: FLAG_OPTIONS.find((o) => o.value === filters.flag)!.label,
      onClear: () => setFilter("flag", ""),
    },
  ].filter(Boolean) as { label: string; onClear: () => void }[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Khách hàng"
        count={filtered.length}
        description="Sửa thông tin nhận tiền, đặt % hoa hồng riêng và cấp quyền quản trị."
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
        <StatCard label="Khách đang lọc" value={summary.count.toLocaleString("vi-VN")} hint={`${summary.withOrders} người có đơn`} />
        <StatCard label="Còn phải trả" value={formatAmount(summary.unpaidAmount)} tone="warning" />
        <StatCard label="Đã trả" value={formatAmount(summary.paidAmount)} tone="success" />
        <StatCard
          label="Chưa có tài khoản NH"
          value={summary.noBank.toLocaleString("vi-VN")}
          hint="không rút tiền được"
          tone={summary.noBank ? "danger" : "muted"}
        />
      </StatGrid>

      <Toolbar>
        <SearchInput
          value={filters.q}
          onChange={(v) => setFilter("q", v)}
          placeholder="Tìm theo tên, SĐT, email, số tài khoản…"
        />
        <SelectFilter label="Vai trò" value={filters.role} options={ROLE_OPTIONS} onChange={(v) => setFilter("role", v)} />
        <SelectFilter label="Nhóm" value={filters.flag} options={FLAG_OPTIONS} onChange={(v) => setFilter("flag", v)} />
        <SelectFilter
          label="Sắp xếp"
          value={filters.sort}
          options={SORT_OPTIONS}
          onChange={(v) => setFilter("sort", v)}
          className="min-w-[190px]"
        />
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            setFilters(EMPTY_FILTERS);
            setPage(0);
          }}
          isDisabled={!chips.length && filters.sort === "unpaid_desc"}
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
                <Table.Content aria-label="Khách hàng" className="min-w-[1180px]">
                  <Table.Header>
                    <Table.Column isRowHeader>Khách hàng</Table.Column>
                    <Table.Column>Tài khoản nhận tiền</Table.Column>
                    <Table.Column>% Hoa hồng</Table.Column>
                    <Table.Column className="text-right">Đã trả</Table.Column>
                    <Table.Column className="text-right">Còn nợ</Table.Column>
                    <Table.Column className="text-center">Đang chờ</Table.Column>
                    <Table.Column className="text-right">Thao tác</Table.Column>
                    <Table.Column className="text-right">Quản trị</Table.Column>
                  </Table.Header>
                  <Table.Body
                    renderEmptyState={() => (
                      <EmptyState
                        title="Không có khách hàng nào khớp"
                        description="Thử đổi từ khoá hoặc bỏ bớt bộ lọc."
                      />
                    )}
                  >
                    {pageRows.map((c) => (
                      <EditableRow key={c.userId} customer={c} onSaved={load} />
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
    </div>
  );
}
