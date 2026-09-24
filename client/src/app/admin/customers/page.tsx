"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Input, Spinner, Table } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount } from "@/lib/format";

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
      <span className="flex items-center gap-1.5">
        {customer.phone || <span className="text-[var(--muted)]">Chưa có SĐT</span>}
        {customer.role === "admin" && (
          <Chip size="sm" color="accent">
            Admin
          </Chip>
        )}
      </span>
      {(customer.fullName || customer.email) && (
        <span className="text-xs text-[var(--muted)]">{[customer.fullName, customer.email].filter(Boolean).join(" · ")}</span>
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
        <Table.Cell className="text-[var(--muted)]">{customer.zaloUserId}</Table.Cell>
        <Table.Cell>
          {customer.bankName ? `${customer.bankName} · ${customer.bankAccountNumber} · ${customer.bankAccountHolder}` : "-"}
        </Table.Cell>
        <Table.Cell>
          {customer.commissionPct !== null && customer.commissionPct !== undefined ? `${customer.commissionPct}%` : "Mặc định"}
        </Table.Cell>
        <Table.Cell className="text-right text-[var(--success-soft-foreground)]">
          {customer.paidOrders} đơn · {formatAmount(customer.paidAmount)}
        </Table.Cell>
        <Table.Cell className="text-right text-[var(--warning-soft-foreground)]">
          {customer.unpaidOrders} đơn · {formatAmount(customer.unpaidAmount)}
        </Table.Cell>
        <Table.Cell className="text-center">
          <Chip color="accent">{customer.pendingOrders} đang chờ</Chip>
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
      <Table.Cell className="text-[var(--muted)]">{customer.zaloUserId}</Table.Cell>
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
      <Table.Cell className="text-right text-[var(--success-soft-foreground)]">
        {customer.paidOrders} đơn · {formatAmount(customer.paidAmount)}
      </Table.Cell>
      <Table.Cell className="text-right text-[var(--warning-soft-foreground)]">
        {customer.unpaidOrders} đơn · {formatAmount(customer.unpaidAmount)}
      </Table.Cell>
      <Table.Cell className="text-center">
        <Chip color="accent">{customer.pendingOrders} đang chờ</Chip>
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await clientApi.get<Customer[]>("/api/customers");
      setCustomers(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách khách hàng");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-[var(--foreground)]">Khách hàng ({customers.length})</h1>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <Card>
          <Card.Content>
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Khách hàng" className="min-w-[1120px]">
                  <Table.Header>
                    <Table.Column isRowHeader>Khách hàng</Table.Column>
                    <Table.Column>Zalo ID</Table.Column>
                    <Table.Column>Thanh toán</Table.Column>
                    <Table.Column>% Hoa hồng</Table.Column>
                    <Table.Column className="text-right">Đã trả</Table.Column>
                    <Table.Column className="text-right">Còn nợ</Table.Column>
                    <Table.Column className="text-center">Đang chờ</Table.Column>
                    <Table.Column className="text-right">Thao tác</Table.Column>
                    <Table.Column className="text-right">Quản trị</Table.Column>
                  </Table.Header>
                  <Table.Body renderEmptyState={() => <span className="text-sm text-[var(--muted)]">Chưa có khách hàng nào</span>}>
                    {customers.map((c) => (
                      <EditableRow key={c.userId} customer={c} onSaved={load} />
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </Card.Content>
        </Card>
      )}
    </div>
  );
}
