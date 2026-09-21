"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Spinner, toast } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount } from "@/lib/format";
import { RefreshIcon } from "@/components/icons";

type Stats = {
  completedOrders?: number;
  pendingOrders?: number;
  paidOrders?: number;
  unpaidOrders?: number;
  totalCommission?: number;
  totalUserCommission?: number;
  totalOperatorCommission?: number;
  totalPaidAmount?: number;
  totalUnpaidAmount?: number;
};

type Session = { loggedIn?: boolean };

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "warning" ? "text-[var(--warning-soft-foreground)]" : tone === "success" ? "text-[var(--success-soft-foreground)]" : "text-[var(--foreground)]";
  return (
    <Card>
      <Card.Content className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      </Card.Content>
    </Card>
  );
}

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [reconciling, setReconciling] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, sess] = await Promise.all([
        clientApi.get<Stats>("/api/stats"),
        clientApi.get<Session>("/api/session"),
      ]);
      setStats(s);
      setSession(sess);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runReconcile() {
    setReconciling(true);
    try {
      await clientApi.post("/api/reconcile");
      toast.success("Đã đối soát xong");
      await load();
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Đối soát thất bại");
    } finally {
      setReconciling(false);
    }
  }

  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!stats) return <Spinner size="sm" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Tổng quan</h1>
        <div className="flex items-center gap-3">
          {session && (
            <Chip color={session.loggedIn ? "success" : "danger"}>
              {session.loggedIn ? "Phiên Shopee: đang hoạt động" : "Phiên Shopee: chưa đăng nhập"}
            </Chip>
          )}
          <Button onPress={runReconcile} isDisabled={reconciling} isPending={reconciling}>
            <RefreshIcon className="h-4 w-4" />
            {reconciling ? "Đang đối soát..." : "Đối soát ngay"}
          </Button>
        </div>
      </div>

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
