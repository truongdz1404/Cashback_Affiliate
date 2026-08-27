"use client";

import { useEffect, useState, useCallback } from "react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount } from "@/lib/format";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";

export default function OverviewPage() {
  const [stats, setStats] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMsg, setReconcileMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, sess] = await Promise.all([clientApi.get("/api/stats"), clientApi.get("/api/session")]);
      setStats(s);
      setSession(sess);
    } catch (err) {
      setError(err.message || "Không tải được dữ liệu");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runReconcile() {
    setReconciling(true);
    setReconcileMsg("");
    try {
      await clientApi.post("/api/reconcile");
      setReconcileMsg("Đã đối soát xong, đang làm mới dữ liệu...");
      await load();
    } catch (err) {
      setReconcileMsg(err.message || "Đối soát thất bại");
    } finally {
      setReconciling(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!stats) return <p className="text-sm text-slate-500">Đang tải...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Tổng quan</h1>
        <div className="flex items-center gap-3">
          {session && (
            <Badge tone={session.loggedIn ? "green" : "red"}>
              {session.loggedIn ? "Phiên Shopee: đang hoạt động" : "Phiên Shopee: chưa đăng nhập"}
            </Badge>
          )}
          <button
            onClick={runReconcile}
            disabled={reconciling}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {reconciling ? "Đang đối soát..." : "Đối soát ngay"}
          </button>
        </div>
      </div>
      {reconcileMsg && <p className="text-sm text-slate-500">{reconcileMsg}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Đơn hoàn thành" value={stats.completedOrders ?? 0} />
        <StatCard label="Đơn đang chờ (Shopee)" value={stats.pendingOrders ?? 0} tone="warning" />
        <StatCard label="Đơn đã thanh toán" value={stats.paidOrders ?? 0} tone="success" />
        <StatCard label="Đơn chưa thanh toán" value={stats.unpaidOrders ?? 0} tone="warning" />
        <StatCard label="Tổng hoa hồng" value={formatAmount(stats.totalCommission)} />
        <StatCard label="Hoa hồng người dùng" value={formatAmount(stats.totalUserCommission)} />
        <StatCard label="Hoa hồng vận hành" value={formatAmount(stats.totalOperatorCommission)} />
        <StatCard label="Đã trả cho khách" value={formatAmount(stats.totalPaidAmount)} tone="success" />
        <StatCard label="Còn phải trả khách" value={formatAmount(stats.totalUnpaidAmount)} tone="warning" />
      </div>
    </div>
  );
}
