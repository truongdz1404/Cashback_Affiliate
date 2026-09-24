"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@heroui/react";
import { appClient, AppRequestError } from "@/lib/appClient";
import { formatVnd } from "@/lib/format";
import type { CoinStatus } from "@/lib/appTypes";
import { CoinIcon } from "@/components/icons";

// The seven-rung ladder, one tap a day. Everything about who is on which rung
// comes from the server: the browser clock is not trusted to decide whether
// "today" has already been claimed.
export default function CoinCheckin({ initial }: { initial: CoinStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [claiming, setClaiming] = useState(false);
  const [celebrate, setCelebrate] = useState<number | null>(null);

  if (!status.enabled) return null;

  async function claim() {
    if (claiming || !status.canClaim) return;
    setClaiming(true);
    try {
      const next = await appClient.post<CoinStatus & { claimed: boolean; reward: number }>("/coins/checkin");
      setStatus(next);
      if (next.claimed) setCelebrate(next.reward);
      else toast.info("Hôm nay bạn đã điểm danh rồi", { description: "Quay lại vào ngày mai nhé." });
      router.refresh();
    } catch (err) {
      const message = err instanceof AppRequestError ? err.message : "Vui lòng thử lại.";
      if (!(err instanceof AppRequestError) || err.status !== 401) {
        toast.danger("Không điểm danh được", { description: message });
      }
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[var(--foreground)]">{status.title}</p>
          <p className="text-xs text-[var(--muted)]">{status.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-[var(--warning)]/15 px-3.5 py-1.5">
          <CoinIcon className="h-4.5 w-4.5 text-[#E8A33D]" />
          <span className="text-sm font-extrabold tabular-nums text-[var(--foreground)]">
            {status.available.toLocaleString("vi-VN")} xu
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {status.days.map((day) => (
          <div
            key={day.day}
            className={[
              "flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-center",
              day.claimed
                ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]/30"
                : day.isToday
                  ? "bg-[var(--warning)]/15 ring-2 ring-[#E8A33D]"
                  : "bg-[var(--surface-secondary)]",
            ].join(" ")}
          >
            <span className="text-[11px] font-bold text-[var(--muted)]">
              {day.isToday && !status.claimedToday ? "Hôm nay" : `Ngày ${day.day}`}
            </span>
            <CoinIcon className={`h-5 w-5 ${day.claimed ? "text-[var(--accent)]" : "text-[#E8A33D]"}`} />
            <span className="text-xs font-extrabold tabular-nums text-[var(--foreground)]">+{day.reward}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={claim}
        disabled={!status.canClaim || claiming}
        className="rounded-full bg-[var(--accent)] py-3 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105 disabled:opacity-50"
      >
        {claiming
          ? "Đang nhận…"
          : status.canClaim
            ? `Nhận ngay ${status.nextReward} xu`
            : "Hôm nay đã điểm danh — mai quay lại nhé"}
      </button>

      <p className="text-xs leading-relaxed text-[var(--muted)]">{status.note}</p>

      {celebrate !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-xs rounded-2xl bg-[var(--surface)] p-6 text-center">
            <CoinIcon className="mx-auto h-14 w-14 text-[#E8A33D]" />
            <h3 className="mt-3 text-lg font-extrabold text-[var(--foreground)]">Chúc mừng</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Bạn nhận được <span className="font-extrabold text-[var(--accent)]">{celebrate} xu</span>
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {celebrate} xu = {formatVnd(celebrate)} · dùng khi rút tiền
            </p>
            <button
              type="button"
              onClick={() => setCelebrate(null)}
              className="mt-5 w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-extrabold text-[var(--accent-foreground)]"
            >
              Tuyệt vời
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
