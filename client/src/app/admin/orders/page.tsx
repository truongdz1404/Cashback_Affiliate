"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, ListBox, Select, Table } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatDateTime, displayStatusLabel } from "@/lib/format";

const PAGE_SIZE = 20;

type Order = {
  id: number | string;
  orderSn: string;
  userPhone?: string | null;
  zaloUserId?: string | null;
  displayOrderStatus: number;
  userCommission?: number | null;
  operatorCommission?: number | null;
  payoutStatus: string;
  purchaseTime?: string | null;
};

const DISPLAY_FILTER_OPTIONS = [
  { value: "", label: "Tất cả trạng thái Shopee" },
  { value: "1", label: "Đang chờ" },
  { value: "2", label: "Hoàn thành" },
  { value: "3", label: "Đã huỷ" },
  { value: "4", label: "Chưa thanh toán (Shopee)" },
];

const PAYOUT_FILTER_OPTIONS = [
  { value: "", label: "Tất cả thanh toán" },
  { value: "paid", label: "Đã thanh toán" },
  { value: "unpaid", label: "Chưa thanh toán" },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [payoutFilter, setPayoutFilter] = useState("");
  const [displayFilter, setDisplayFilter] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<Order["id"] | null>(null);

  const load = useCallback(async () => {
    setError("");
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (payoutFilter) params.set("payoutStatus", payoutFilter);
    if (displayFilter) params.set("displayStatus", displayFilter);
    try {
      const data = await clientApi.get<{ orders: Order[]; total: number }>(`/api/orders?${params.toString()}`);
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được đơn hàng");
    }
  }, [page, payoutFilter, displayFilter]);

  useEffect(() => {
    load();
  }, [load]);

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Đơn hàng ({total})</h1>
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Lọc theo trạng thái Shopee"
            selectedKey={displayFilter}
            onSelectionChange={(key) => {
              setPage(0);
              setDisplayFilter(String(key ?? ""));
            }}
          >
            <Select.Trigger className="min-w-[200px]">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {DISPLAY_FILTER_OPTIONS.map((opt) => (
                  <ListBox.Item key={opt.value} id={opt.value}>
                    {opt.label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Select
            aria-label="Lọc theo thanh toán"
            selectedKey={payoutFilter}
            onSelectionChange={(key) => {
              setPage(0);
              setPayoutFilter(String(key ?? ""));
            }}
          >
            <Select.Trigger className="min-w-[180px]">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {PAYOUT_FILTER_OPTIONS.map((opt) => (
                  <ListBox.Item key={opt.value} id={opt.value}>
                    {opt.label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <Card>
        <Card.Content>
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Đơn hàng" className="min-w-[920px]">
                <Table.Header>
                  <Table.Column isRowHeader>Mã đơn</Table.Column>
                  <Table.Column>Khách hàng</Table.Column>
                  <Table.Column>Trạng thái Shopee</Table.Column>
                  <Table.Column className="text-right">Hoa hồng khách</Table.Column>
                  <Table.Column className="text-right">Hoa hồng vận hành</Table.Column>
                  <Table.Column>Thanh toán</Table.Column>
                  <Table.Column>Ngày mua</Table.Column>
                  <Table.Column className="text-right">Thao tác</Table.Column>
                </Table.Header>
                <Table.Body renderEmptyState={() => <span className="text-sm text-[var(--muted)]">Chưa có đơn hàng nào</span>}>
                  {orders.map((o) => (
                    <Table.Row key={o.id}>
                      <Table.Cell className="font-mono text-xs">{o.orderSn}</Table.Cell>
                      <Table.Cell>{o.userPhone || o.zaloUserId || "-"}</Table.Cell>
                      <Table.Cell>
                        <Chip color={o.displayOrderStatus === 2 ? "success" : o.displayOrderStatus === 3 ? "danger" : "default"}>
                          {displayStatusLabel(o.displayOrderStatus)}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className="text-right">{formatAmount(o.userCommission)}</Table.Cell>
                      <Table.Cell className="text-right text-[var(--muted)]">{formatAmount(o.operatorCommission)}</Table.Cell>
                      <Table.Cell>
                        <Chip color={o.payoutStatus === "paid" ? "success" : "warning"}>
                          {o.payoutStatus === "paid" ? "Đã trả" : "Chưa trả"}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className="text-[var(--muted)]">{formatDateTime(o.purchaseTime)}</Table.Cell>
                      <Table.Cell className="text-right">
                        {o.displayOrderStatus === 2 && (
                          <Button size="sm" variant="outline" onPress={() => togglePayout(o)} isDisabled={busyId === o.id}>
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

      <div className="flex items-center justify-between text-sm text-[var(--muted)]">
        <span>
          Trang {page + 1} / {totalPages}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onPress={() => setPage((p) => Math.max(0, p - 1))} isDisabled={page === 0}>
            Trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            isDisabled={page >= totalPages - 1}
          >
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
