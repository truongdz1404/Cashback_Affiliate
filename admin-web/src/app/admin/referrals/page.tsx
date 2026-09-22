"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Chip, ListBox, Select, Spinner, Table } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatDateTime, formatPct } from "@/lib/format";

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

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "unpaid", label: "Chưa thanh toán" },
  { value: "paid", label: "Đã thanh toán" },
  { value: "revoked", label: "Đã thu hồi" },
  { value: "", label: "Tất cả" },
];

function who(p: Party | null | undefined, id: number) {
  if (!p) return `#${id}`;
  return p.phone || p.email || p.fullName || `#${id}`;
}

function PartyCell({ party, id }: { party: Party; id: number }) {
  const secondary = [party.fullName, party.phone ? party.email : null].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-0.5">
      <span>{who(party, id)}</span>
      {secondary && <span className="text-xs text-[var(--muted)]">{secondary}</span>}
    </div>
  );
}

export default function ReferralsPage() {
  const [rows, setRows] = useState<ReferralCommissionRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("unpaid");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    const qs = statusFilter ? `?payoutStatus=${statusFilter}` : "";
    try {
      const data = await clientApi.get<ReferralCommissionRow[]>(`/api/referral-commissions${qs}`);
      setRows(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được hoa hồng giới thiệu");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Per-referrer subtotal of what is on screen - the number the admin
  // actually transfers when clearing the unpaid queue for one person.
  const byReferrer = useMemo(() => {
    const map = new Map<number, { label: string; total: number; count: number }>();
    for (const r of rows) {
      const cur = map.get(r.referrerUserId) || { label: who(r.referrer, r.referrerUserId), total: 0, count: 0 };
      cur.total += r.amount;
      cur.count += 1;
      map.set(r.referrerUserId, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [rows]);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  async function markPaid(row: ReferralCommissionRow) {
    const ok = window.confirm(
      `Đánh dấu đã thanh toán ${formatAmount(row.amount)} hoa hồng giới thiệu cho ${who(row.referrer, row.referrerUserId)}? Chỉ làm sau khi đã chuyển khoản.`,
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await clientApi.put(`/api/referral-commissions/${row.id}/payout`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật thất bại");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--foreground)]">Hoa hồng giới thiệu ({rows.length})</h1>
          <p className="text-xs text-[var(--muted)]">
            Mỗi đơn hoàn thành của người được giới thiệu tạo một dòng hoa hồng cho người giới thiệu. Tổng đang hiển thị:{" "}
            <span className="font-semibold text-[var(--foreground)]">{formatAmount(total)}</span>
          </p>
        </div>
        <Select
          aria-label="Lọc theo trạng thái thanh toán"
          selectedKey={statusFilter}
          onSelectionChange={(key) => setStatusFilter(String(key ?? ""))}
        >
          <Select.Trigger className="min-w-[180px]">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {FILTER_OPTIONS.map((opt) => (
                <ListBox.Item key={opt.value} id={opt.value}>
                  {opt.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {statusFilter === "unpaid" && byReferrer.length > 0 && (
        <Card>
          <Card.Header>
            <Card.Title>Cần chuyển theo người giới thiệu</Card.Title>
            <Card.Description>Tổng chưa thanh toán gộp theo từng người, để chuyển khoản một lần rồi đánh dấu từng dòng bên dưới.</Card.Description>
          </Card.Header>
          <Card.Content>
            <ul className="flex flex-wrap gap-2">
              {byReferrer.map(([id, v]) => (
                <li key={id} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
                  <span className="font-semibold text-[var(--foreground)]">{v.label}</span>
                  <span className="text-[var(--muted)]"> · {v.count} đơn · </span>
                  <span className="font-semibold text-[var(--warning-soft-foreground)]">{formatAmount(v.total)}</span>
                </li>
              ))}
            </ul>
          </Card.Content>
        </Card>
      )}

      {loading ? (
        <Spinner size="sm" />
      ) : (
        <Card>
          <Card.Content>
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Hoa hồng giới thiệu" className="min-w-[1040px]">
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
                      <span className="text-sm text-[var(--muted)]">Chưa có hoa hồng giới thiệu nào ở trạng thái này</span>
                    )}
                  >
                    {rows.map((r) => (
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
                              <span className="max-w-[240px] truncate text-xs text-[var(--muted)]">{r.order.productName}</span>
                            )}
                          </div>
                        </Table.Cell>
                        <Table.Cell className="text-right text-[var(--muted)]">{formatAmount(r.baseAmount)}</Table.Cell>
                        <Table.Cell className="text-right text-[var(--muted)]">{formatPct(r.pct)}</Table.Cell>
                        <Table.Cell className="text-right font-semibold">{formatAmount(r.amount)}</Table.Cell>
                        <Table.Cell>
                          <Chip color={STATUS_COLORS[r.payoutStatus] || "default"}>{STATUS_LABELS[r.payoutStatus] || r.payoutStatus}</Chip>
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
          </Card.Content>
        </Card>
      )}

      <p className="text-xs text-[var(--muted)]">
        Lưu ý: hoa hồng chưa thanh toán đã được tính vào số dư khả dụng của người giới thiệu. Khi họ rút tiền, admin chuyển khoản
        thủ công rồi đánh dấu các dòng tương ứng ở đây. Đơn bị Shopee huỷ sẽ tự chuyển sang &quot;Đã thu hồi&quot; nếu chưa trả; nếu
        đã trả, hệ thống ghi cờ thu hồi để xử lý tay. % và thời hạn chỉnh ở trang Cài đặt.
      </p>
    </div>
  );
}
