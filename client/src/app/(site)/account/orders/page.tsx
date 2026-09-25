import type { Metadata } from "next";
import { appFetchSafe } from "@/lib/appApi";
import type { Order } from "@/lib/appTypes";
import { formatVnd } from "@/lib/format";
import { PageHeading, StatTile } from "@/components/account/ui";
import OrdersList from "@/components/account/OrdersList";

export const metadata: Metadata = { title: "Tiền hoàn của tôi | Rewally" };

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
      <PageHeading
        title="Tiền hoàn của tôi"
        description="Đơn mua qua Rewally được ghi nhận sau khoảng 6 giờ, kèm số tiền hoàn của từng đơn."
      />

      {/* Two per row on phones, with the money - the reason anyone opens this
          page - full width and first. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          className="order-first col-span-2 sm:order-none sm:col-span-1"
          label="Tiền hoàn từ đơn hoàn thành"
          value={formatVnd(totalCashback)}
          tone="accent"
        />
        <StatTile label="Tổng đơn" value={String(orders.length)} />
        <StatTile label="Hoàn thành" value={String(completed.length)} />
      </div>

      <OrdersList orders={orders} capped={orders.length >= LIMIT} />
    </div>
  );
}
