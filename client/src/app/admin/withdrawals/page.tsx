"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, ListBox, Select, Table } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatDateTime } from "@/lib/format";

type WithdrawalStatus = "pending" | "approved" | "rejected" | "paid";

type WithdrawalRequest = {
  id: number | string;
  userPhone?: string | null;
  amount: number;
  coinAmount?: number | null;
  method: string;
  status: WithdrawalStatus;
  createdAt?: string | null;
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

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "pending", label: "Chờ duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "rejected", label: "Từ chối" },
  { value: "paid", label: "Đã thanh toán" },
];

export default function WithdrawalsPage() {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<WithdrawalRequest["id"] | null>(null);

  const load = useCallback(async () => {
    setError("");
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    try {
      const data = await clientApi.get<WithdrawalRequest[]>(`/api/withdrawals${qs}`);
      setRequests(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được yêu cầu thanh toán");
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(request: WithdrawalRequest, status: WithdrawalStatus) {
    setBusyId(request.id);
    try {
      await clientApi.put(`/api/withdrawals/${request.id}`, { status });
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
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Yêu cầu thanh toán ({requests.length})</h1>
        <Select
          aria-label="Lọc theo trạng thái"
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

      <Card>
        <Card.Content>
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Yêu cầu thanh toán" className="min-w-[900px]">
                <Table.Header>
                  <Table.Column isRowHeader>Khách hàng</Table.Column>
                  <Table.Column className="text-right">Tiền hoàn</Table.Column>
                  <Table.Column className="text-right">Xu</Table.Column>
                  <Table.Column className="text-right">Tổng chuyển</Table.Column>
                  <Table.Column>Phương thức</Table.Column>
                  <Table.Column>Trạng thái</Table.Column>
                  <Table.Column>Ngày tạo</Table.Column>
                  <Table.Column className="text-right">Thao tác</Table.Column>
                </Table.Header>
                <Table.Body
                  renderEmptyState={() => (
                    <span className="text-sm text-[var(--muted)]">Chưa có yêu cầu thanh toán nào</span>
                  )}
                >
                  {requests.map((r) => (
                    <Table.Row key={r.id}>
                      <Table.Cell>{r.userPhone || "-"}</Table.Cell>
                      <Table.Cell className="text-right">{formatAmount(r.amount)}</Table.Cell>
                      <Table.Cell className="text-right text-[var(--muted)]">
                        {r.coinAmount ? `${r.coinAmount.toLocaleString("vi-VN")} xu` : "-"}
                      </Table.Cell>
                      <Table.Cell className="text-right font-semibold">
                        {formatAmount(r.amount + (r.coinAmount || 0))}
                      </Table.Cell>
                      <Table.Cell className="text-[var(--muted)]">{r.method}</Table.Cell>
                      <Table.Cell>
                        <Chip color={STATUS_COLORS[r.status] || "default"}>{STATUS_LABELS[r.status] || r.status}</Chip>
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
                                variant="outline"
                                onPress={() => setStatus(r, "paid")}
                                isDisabled={busyId === r.id}
                              >
                                Đánh dấu đã thanh toán
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
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card.Content>
      </Card>

      <p className="text-xs text-[var(--muted)]">
        Lưu ý: duyệt/đánh dấu đã thanh toán ở đây không tự động chuyển khoản — admin vẫn chuyển khoản thủ công và đánh dấu từng đơn hàng liên quan đã trả ở trang Đơn hàng. Số tiền cần chuyển là cột <strong>Tổng chuyển</strong> (tiền hoàn + xu, 1 xu = 1đ). Từ chối một yêu cầu sẽ tự hoàn xu về cho người dùng.
      </p>
    </div>
  );
}
