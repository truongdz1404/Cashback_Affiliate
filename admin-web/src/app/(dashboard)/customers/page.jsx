"use client";

import { useEffect, useState, useCallback } from "react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount } from "@/lib/format";
import Badge from "@/components/Badge";

function EditableRow({ customer, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    phone: customer.phone || "",
    bankName: customer.bankName || "",
    bankAccountNumber: customer.bankAccountNumber || "",
    bankAccountHolder: customer.bankAccountHolder || "",
    commissionPct: customer.commissionPct ?? "",
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
      setError(err.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <tr>
        <td className="px-3 py-2 text-slate-700">{customer.phone || <span className="text-slate-400">Chưa có SĐT</span>}</td>
        <td className="px-3 py-2 text-slate-500">{customer.zaloUserId}</td>
        <td className="px-3 py-2 text-slate-700">
          {customer.bankName ? `${customer.bankName} · ${customer.bankAccountNumber} · ${customer.bankAccountHolder}` : "-"}
        </td>
        <td className="px-3 py-2 text-slate-700">
          {customer.commissionPct !== null && customer.commissionPct !== undefined ? `${customer.commissionPct}%` : "Mặc định"}
        </td>
        <td className="px-3 py-2 text-right text-emerald-700">
          {customer.paidOrders} đơn · {formatAmount(customer.paidAmount)}
        </td>
        <td className="px-3 py-2 text-right text-amber-700">
          {customer.unpaidOrders} đơn · {formatAmount(customer.unpaidAmount)}
        </td>
        <td className="px-3 py-2 text-center">
          <Badge tone="blue">{customer.pendingOrders} đang chờ</Badge>
        </td>
        <td className="px-3 py-2 text-right">
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Sửa
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-orange-50/40">
      <td className="px-3 py-2">
        <input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="w-28 rounded border border-slate-300 px-2 py-1 text-xs"
          placeholder="SĐT"
        />
      </td>
      <td className="px-3 py-2 text-slate-500">{customer.zaloUserId}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <input
            value={form.bankName}
            onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="Ngân hàng"
          />
          <input
            value={form.bankAccountNumber}
            onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="Số tài khoản"
          />
          <input
            value={form.bankAccountHolder}
            onChange={(e) => setForm((f) => ({ ...f, bankAccountHolder: e.target.value }))}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="Chủ tài khoản"
          />
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          value={form.commissionPct}
          onChange={(e) => setForm((f) => ({ ...f, commissionPct: e.target.value }))}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
          placeholder="% mặc định"
        />
      </td>
      <td className="px-3 py-2 text-right text-emerald-700">
        {customer.paidOrders} đơn · {formatAmount(customer.paidAmount)}
      </td>
      <td className="px-3 py-2 text-right text-amber-700">
        {customer.unpaidOrders} đơn · {formatAmount(customer.unpaidAmount)}
      </td>
      <td className="px-3 py-2 text-center">
        <Badge tone="blue">{customer.pendingOrders} đang chờ</Badge>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-1">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-orange-600 px-2 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            Lưu
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Huỷ
          </button>
        </div>
        {error && <p className="mt-1 text-right text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await clientApi.get("/api/customers");
      setCustomers(data || []);
    } catch (err) {
      setError(err.message || "Không tải được danh sách khách hàng");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Khách hàng ({customers.length})</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Đang tải...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-500">SĐT</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Zalo ID</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Thanh toán</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">% Hoa hồng</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">Đã trả</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">Còn nợ</th>
                <th className="px-3 py-2 text-center font-medium text-slate-500">Đang chờ</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <EditableRow key={c.userId} customer={c} onSaved={load} />
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    Chưa có khách hàng nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
