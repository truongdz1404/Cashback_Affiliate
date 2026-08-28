"use client";

import { useEffect, useState, useCallback } from "react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatDate } from "@/lib/format";
import Badge from "@/components/Badge";

const STATUS_LABELS = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  paid: "Đã thanh toán",
};

const STATUS_TONES = {
  pending: "amber",
  approved: "blue",
  rejected: "red",
  paid: "green",
};

export default function WithdrawalsPage() {
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    try {
      const data = await clientApi.get(`/api/withdrawals${qs}`);
      setRequests(data || []);
    } catch (err) {
      setError(err.message || "Không tải được yêu cầu thanh toán");
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(request, status) {
    setBusyId(request.id);
    try {
      await clientApi.put(`/api/withdrawals/${request.id}`, { status });
      await load();
    } catch (err) {
      setError(err.message || "Cập nhật thất bại");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Yêu cầu thanh toán ({requests.length})</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
          <option value="paid">Đã thanh toán</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Khách hàng</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">Số tiền</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Phương thức</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Trạng thái</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Ngày tạo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-slate-700">{r.userPhone || "-"}</td>
                <td className="px-3 py-2 text-right text-slate-700">{formatAmount(r.amount)}</td>
                <td className="px-3 py-2 text-slate-500">{r.method}</td>
                <td className="px-3 py-2">
                  <Badge tone={STATUS_TONES[r.status] || "slate"}>{STATUS_LABELS[r.status] || r.status}</Badge>
                </td>
                <td className="px-3 py-2 text-slate-500">{formatDate(r.createdAt)}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    {r.status === "pending" && (
                      <>
                        <button
                          onClick={() => setStatus(r, "approved")}
                          disabled={busyId === r.id}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Duyệt
                        </button>
                        <button
                          onClick={() => setStatus(r, "rejected")}
                          disabled={busyId === r.id}
                          className="rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Từ chối
                        </button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <>
                        <button
                          onClick={() => setStatus(r, "paid")}
                          disabled={busyId === r.id}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Đánh dấu đã thanh toán
                        </button>
                        <button
                          onClick={() => setStatus(r, "rejected")}
                          disabled={busyId === r.id}
                          className="rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Từ chối
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  Chưa có yêu cầu thanh toán nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Lưu ý: duyệt/đánh dấu đã thanh toán ở đây không tự động chuyển khoản — admin vẫn chuyển khoản thủ công và đánh dấu từng đơn hàng liên quan đã trả ở trang Đơn hàng.
      </p>
    </div>
  );
}
