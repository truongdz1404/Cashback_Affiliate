"use client";

import { useEffect, useState, useCallback } from "react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatDate, displayStatusLabel } from "@/lib/format";
import Badge from "@/components/Badge";

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [payoutFilter, setPayoutFilter] = useState("");
  const [displayFilter, setDisplayFilter] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (payoutFilter) params.set("payoutStatus", payoutFilter);
    if (displayFilter) params.set("displayStatus", displayFilter);
    try {
      const data = await clientApi.get(`/api/orders?${params.toString()}`);
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || "Không tải được đơn hàng");
    }
  }, [page, payoutFilter, displayFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function togglePayout(order) {
    setBusyId(order.id);
    try {
      await clientApi.put(`/api/orders/${order.id}/payout`, { paid: order.payoutStatus !== "paid" });
      await load();
    } catch (err) {
      setError(err.message || "Cập nhật thất bại");
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Đơn hàng ({total})</h1>
        <div className="flex gap-2">
          <select
            value={displayFilter}
            onChange={(e) => {
              setPage(0);
              setDisplayFilter(e.target.value);
            }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Tất cả trạng thái Shopee</option>
            <option value="1">Đang chờ</option>
            <option value="2">Hoàn thành</option>
            <option value="3">Đã huỷ</option>
            <option value="4">Chưa thanh toán (Shopee)</option>
          </select>
          <select
            value={payoutFilter}
            onChange={(e) => {
              setPage(0);
              setPayoutFilter(e.target.value);
            }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Tất cả thanh toán</option>
            <option value="paid">Đã thanh toán</option>
            <option value="unpaid">Chưa thanh toán</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Mã đơn</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Khách hàng</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Trạng thái Shopee</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">Hoa hồng khách</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">Hoa hồng vận hành</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Thanh toán</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Ngày mua</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2 font-mono text-xs text-slate-700">{o.orderSn}</td>
                <td className="px-3 py-2 text-slate-700">{o.userPhone || o.zaloUserId || "-"}</td>
                <td className="px-3 py-2">
                  <Badge tone={o.displayOrderStatus === 2 ? "green" : o.displayOrderStatus === 3 ? "red" : "slate"}>
                    {displayStatusLabel(o.displayOrderStatus)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right text-slate-700">{formatAmount(o.userCommission)}</td>
                <td className="px-3 py-2 text-right text-slate-500">{formatAmount(o.operatorCommission)}</td>
                <td className="px-3 py-2">
                  <Badge tone={o.payoutStatus === "paid" ? "green" : "amber"}>
                    {o.payoutStatus === "paid" ? "Đã trả" : "Chưa trả"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-slate-500">{formatDate(o.purchaseTime)}</td>
                <td className="px-3 py-2 text-right">
                  {o.displayOrderStatus === 2 && (
                    <button
                      onClick={() => togglePayout(o)}
                      disabled={busyId === o.id}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {o.payoutStatus === "paid" ? "Đánh dấu chưa trả" : "Đánh dấu đã trả"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  Chưa có đơn hàng nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          Trang {page + 1}/{totalPages}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Trước
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Sau
          </button>
        </div>
      </div>
    </div>
  );
}
