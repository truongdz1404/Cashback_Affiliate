import type { Metadata } from "next";
import { appFetchSafe } from "@/lib/appApi";
import type { Order } from "@/lib/appTypes";
import { formatVnd } from "@/lib/format";
import { StatTile } from "@/components/account/ui";
import OrdersList from "@/components/account/OrdersList";

export const metadata: Metadata = { title: "Đơn hàng | Rewally" };

// 200 is the backend's own cap on /app/orders (see server.js). Pulling one
// page of that size lets the list filter and search without a round trip per
// keystroke; OrdersList says so when the cap is actually reached.
const LIMIT = 200;

export default async function OrdersPage() {
  const orders = await appFetchSafe<Order[]>(`/orders?limit=${LIMIT}`, []);

  const completed = orders.filter((o) => Number(o.displayOrderStatus) === 2);
  const totalCashback = completed.reduce((sum, o) => sum + (o.userCommission ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-extrabold text-[var(--foreground)]">Đơn hàng</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Đơn mua qua Rewally được ghi nhận sau khoảng 6 giờ.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Tổng đơn" value={String(orders.length)} />
        <StatTile label="Hoàn thành" value={String(completed.length)} />
        <StatTile label="Tiền hoàn từ đơn hoàn thành" value={formatVnd(totalCashback)} tone="accent" />
      </div>

      <OrdersList orders={orders} capped={orders.length >= LIMIT} />
    </div>
  );
}
