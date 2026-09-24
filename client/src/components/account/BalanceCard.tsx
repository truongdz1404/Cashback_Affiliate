import Link from "next/link";
import type { WalletTotals } from "@/lib/wallet";
import { formatVnd } from "@/lib/format";
import { ArrowRightIcon } from "@/components/icons";

// The green gradient "Tổng tiền hoàn" card. `full` is the account sidebar
// version with the three-line breakdown; the compact one sits in the header
// dropdown. No hooks, so it renders from server and client components alike.
export default function BalanceCard({
  totals,
  updatedAt,
  variant = "full",
}: {
  totals: WalletTotals;
  /** Already formatted on the server - locale output differs between Node and the browser. */
  updatedAt?: string;
  variant?: "full" | "compact";
}) {
  const compact = variant === "compact";

  return (
    <div
      className={`relative overflow-hidden rounded-[22px] text-white ${compact ? "p-4" : "p-5"}`}
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklab, var(--accent) 88%, black 12%) 0%, var(--accent) 55%, color-mix(in oklab, var(--accent) 70%, white 30%) 100%)",
      }}
    >
      {/* Soft highlight blobs, purely decorative. */}
      <span className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15" />
      <span className="pointer-events-none absolute -bottom-12 right-10 h-28 w-28 rounded-full bg-white/10" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`font-bold uppercase tracking-wide text-white/80 ${compact ? "text-[11px]" : "text-xs"}`}>
              Tổng tiền hoàn
            </p>
            <p className={`mt-1 font-extrabold tabular-nums leading-none ${compact ? "text-2xl" : "text-[32px]"}`}>
              {formatVnd(totals.total)}
            </p>
          </div>
          {compact && (
            <Link
              href="/account"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/20 px-3 text-xs font-extrabold text-white transition hover:bg-white/30"
            >
              Ví của tôi
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {compact ? (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-white/15 px-3 py-2 text-sm">
            <span className="font-semibold text-white/90">Số dư khả dụng</span>
            <span className="font-extrabold tabular-nums">{formatVnd(totals.available)}</span>
          </div>
        ) : (
          <dl className="mt-4 divide-y divide-white/20 rounded-2xl bg-white/15 px-4">
            <Row label="Số dư khả dụng" value={formatVnd(totals.available)} strong />
            <Row label="Chờ xác nhận" value={formatVnd(totals.pending)} />
            <Row label="Đã rút về ngân hàng" value={formatVnd(totals.withdrawn)} />
          </dl>
        )}

        {!compact && updatedAt && (
          <p className="mt-3 text-[11px] text-white/75">Cập nhật lần cuối vào {updatedAt}</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <dt className="text-white/85">{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-base font-extrabold" : "font-bold"}`}>{value}</dd>
    </div>
  );
}
