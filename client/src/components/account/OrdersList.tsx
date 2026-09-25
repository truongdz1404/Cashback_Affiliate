"use client";

import { useMemo, useState } from "react";
import type { Order } from "@/lib/appTypes";
import { formatDateTime, formatVnd, orderStatusLabel } from "@/lib/format";
import { orderStatusTone } from "@/components/account/orderStatus";
import { EmptyState, StatusPill } from "@/components/account/ui";
import { BagIcon, ChevronDownIcon, SearchIcon } from "@/components/icons";

const TABS: { key: "all" | 1 | 2 | 3 | 4; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: 1, label: "Chờ xác nhận" },
  { key: 2, label: "Hoàn thành" },
  { key: 4, label: "Chưa thanh toán" },
  { key: 3, label: "Đã huỷ" },
];

const PAGE_STEP = 20;

// The backend has no per-order endpoint and no server-side filtering on
// /app/orders, so the page hands us the most recent rows and the filtering,
// searching and "xem thêm" all happen here over that set.
export default function OrdersList({ orders, capped }: { orders: Order[]; capped: boolean }) {
  const [tab, setTab] = useState<"all" | 1 | 2 | 3 | 4>("all");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE_STEP);
  const [openId, setOpenId] = useState<number | null>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length };
    for (const order of orders) {
      const key = String(order.displayOrderStatus ?? "");
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (tab !== "all" && Number(order.displayOrderStatus) !== tab) return false;
      if (!term) return true;
      return (
        (order.productName ?? "").toLowerCase().includes(term) ||
        (order.orderSn ?? "").toLowerCase().includes(term)
      );
    });
  }, [orders, tab, search]);

  const shown = filtered.slice(0, visible);

  function pick(key: "all" | 1 | 2 | 3 | 4) {
    setTab(key);
    setVisible(PAGE_STEP);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisible(PAGE_STEP);
          }}
          placeholder="Tìm theo tên sản phẩm hoặc mã đơn"
          aria-label="Tìm đơn hàng"
          className="w-full rounded-full border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-10 pr-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map(({ key, label }) => (
          <button
            key={String(key)}
            type="button"
            onClick={() => pick(key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
              tab === key
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "bg-[var(--surface)] text-[var(--foreground)] hover:text-[var(--accent)]"
            }`}
          >
            {label}
            <span className="ml-1.5 opacity-70">{counts[String(key)] ?? 0}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        orders.length === 0 ? (
          <EmptyState
            icon={BagIcon}
            title="Chưa có đơn hàng nào"
            description="Đơn hàng sẽ xuất hiện ở đây khoảng 6 giờ sau khi bạn mua qua link hoàn tiền của Rewally."
            cta={{ href: "/products", label: "Mua sắm hoàn tiền" }}
          />
        ) : (
          <EmptyState icon={SearchIcon} title="Không có đơn nào khớp bộ lọc" />
        )
      ) : (
        <ul className="flex flex-col gap-2.5">
          {shown.map((order) => {
            const open = openId === order.id;
            return (
              <li key={order.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : order.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                      {order.productName || `Đơn ${order.orderSn}`}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {formatDateTime(order.purchaseTime ?? order.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-extrabold tabular-nums text-[var(--accent)]">
                      {formatVnd(order.userCommission)}
                    </p>
                    <StatusPill
                      label={orderStatusLabel(order.displayOrderStatus)}
                      tone={orderStatusTone(order.displayOrderStatus)}
                    />
                  </div>
                  <ChevronDownIcon
                    className={`h-4 w-4 shrink-0 text-[var(--muted)] transition ${open ? "rotate-180" : ""}`}
                  />
                </button>

                {open && (
                  <dl className="grid gap-x-6 gap-y-2.5 border-t border-[var(--border)] px-4 py-3.5 text-sm sm:grid-cols-2">
                    <Detail label="Mã đơn hàng" value={order.orderSn} mono />
                    <Detail label="Thời gian mua" value={formatDateTime(order.purchaseTime)} />
                    <Detail label="Tiền hoàn của bạn" value={formatVnd(order.userCommission)} accent />
                    <Detail
                      label="Trạng thái thanh toán"
                      value={
                        order.payoutStatus === "paid"
                          ? "Đã thanh toán"
                          : order.payoutStatus === "cancelled"
                            ? "Đã huỷ"
                            : "Chưa thanh toán"
                      }
                    />
                    {order.paidAt && <Detail label="Ngày nhận tiền" value={formatDateTime(order.paidAt)} />}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {visible < filtered.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_STEP)}
          className="self-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-6 py-2.5 text-sm font-bold text-[var(--foreground)] transition hover:border-[var(--accent)]"
        >
          Xem thêm ({filtered.length - visible})
        </button>
      )}

      {capped && (
        <p className="text-center text-xs text-[var(--muted)]">
          Đang hiển thị {orders.length} đơn gần nhất.
        </p>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right font-semibold ${
          accent ? "text-[var(--accent)]" : "text-[var(--foreground)]"
        } ${mono ? "font-mono text-xs" : "text-sm"}`}
      >
        {value || "-"}
      </dd>
    </div>
  );
}
