"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@heroui/react";
import { appClient, AppRequestError } from "@/lib/appClient";
import { formatVnd } from "@/lib/format";
import type { AppUser, WalletSummary, WithdrawalRequest } from "@/lib/appTypes";
import { BankIcon, CheckIcon } from "@/components/icons";

// Mirrors the app's Wallet tab: one bank method, a single open request at a
// time, and a minimum the backend also enforces (MIN_WITHDRAW_AMOUNT).
export default function WithdrawForm({ wallet, user }: { wallet: WalletSummary; user: AppUser }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [withCoins, setWithCoins] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const missingBankInfo = !user.bankName || !user.bankAccountNumber || !user.bankAccountHolder;
  const pendingWithdrawal = wallet.pendingWithdrawal;
  const available = wallet.availableAmount ?? 0;
  const minAmount = wallet.minWithdrawAmount ?? 0;
  const amountNumber = Number(amount.replace(/[^0-9]/g, "")) || 0;

  // Coins go out whole or not at all: they are a bonus balance, not something
  // to nibble at, and one tick box is far less to explain than a second
  // amount field. 1 xu = 1d, so the totals just add up.
  const coinAvailable = wallet.coinAvailable ?? 0;
  const coinsOffered = (wallet.coinWithdrawEnabled ?? false) && coinAvailable > 0;
  const coinAmount = coinsOffered && withCoins ? coinAvailable : 0;
  const total = amountNumber + coinAmount;

  const canSubmit =
    !missingBankInfo && !pendingWithdrawal && total >= minAmount && amountNumber <= available;

  // Only the reason the button is disabled that the user can actually fix by
  // typing - the bank/pending cases already have their own visible blocks.
  let amountProblem: string | null = null;
  if (total > 0 && total < minAmount) amountProblem = `Tối thiểu ${formatVnd(minAmount)}`;
  else if (amountNumber > available) amountProblem = "Vượt quá số dư khả dụng";

  function askConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setConfirming(true);
  }

  async function submit() {
    if (!canSubmit || submitting) return;

    setConfirming(false);
    setSubmitting(true);
    try {
      await appClient.post<WithdrawalRequest>("/wallet/withdraw", { amount: amountNumber, coinAmount });
      setAmount("");
      setWithCoins(false);
      toast.success("Đã gửi yêu cầu", { description: "Yêu cầu thanh toán của bạn đang chờ admin duyệt." });
      router.refresh();
    } catch (err) {
      const message = err instanceof AppRequestError ? translate(err.message) : "Vui lòng thử lại.";
      if (!(err instanceof AppRequestError) || err.status !== 401) {
        toast.danger("Không tạo được yêu cầu", { description: message });
      }
      // A 409 means a request slipped in between the page render and now -
      // refresh so the pending block appears instead of the form.
      if (err instanceof AppRequestError && err.status === 409) router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={askConfirm} className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="withdraw-amount" className="text-sm font-bold text-[var(--foreground)]">
            Số tiền yêu cầu
          </label>
          <span className="text-sm font-bold text-[var(--accent)]">
            Số dư khả dụng {formatVnd(available)}
          </span>
        </div>
        <div className="relative">
          <input
            id="withdraw-amount"
            inputMode="numeric"
            value={amount ? Number(amount).toLocaleString("vi-VN") : ""}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="0"
            disabled={submitting || !!pendingWithdrawal}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--field-background)] py-3 pl-4 pr-24 text-lg font-extrabold tabular-nums text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => setAmount(String(Math.floor(available)))}
            disabled={available <= 0 || !!pendingWithdrawal}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[var(--accent)] disabled:opacity-40"
          >
            Tất cả
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted)]">Tối thiểu {formatVnd(minAmount)}</p>
          {amountProblem && <p className="text-xs font-bold text-[var(--danger)]">{amountProblem}</p>}
        </div>
      </div>

      {coinsOffered && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 transition has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)]">
          <input
            type="checkbox"
            checked={withCoins}
            onChange={(e) => setWithCoins(e.target.checked)}
            disabled={submitting || !!pendingWithdrawal}
            className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-[var(--accent)]"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-[var(--foreground)]">
              Rút cả {coinAvailable.toLocaleString("vi-VN")} xu
            </span>
            <span className="block text-xs text-[var(--muted)]">
              1 xu = 1đ. Xu được cộng vào cùng lần chuyển khoản này, tương đương {formatVnd(coinAvailable)}.
            </span>
          </span>
        </label>
      )}

      {coinAmount > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-[var(--accent-soft)] px-4 py-3">
          <span className="text-sm font-bold text-[var(--foreground)]">Tổng nhận được</span>
          <span className="text-base font-extrabold tabular-nums text-[var(--accent-dark)]">{formatVnd(total)}</span>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm font-bold text-[var(--foreground)]">Phương thức nhận</p>
        <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] py-3">
          <BankIcon className="h-4.5 w-4.5 text-[var(--accent-dark)]" />
          <span className="text-sm font-extrabold text-[var(--accent-dark)]">Ngân hàng</span>
        </div>
      </div>

      {missingBankInfo ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--danger)]/10 px-4 py-3.5">
          <p className="min-w-0 flex-1 text-sm text-[var(--foreground)]">
            Bạn cần cập nhật thông tin ngân hàng trước khi thanh toán.
          </p>
          <Link href="/account/profile" className="text-sm font-extrabold text-[var(--danger)]">
            Cập nhật
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface)]">
            <BankIcon className="h-4.5 w-4.5 text-[var(--accent-dark)]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-[var(--foreground)]">{user.bankName}</p>
            <p className="truncate text-xs text-[var(--muted)]">
              {user.bankAccountNumber} · {user.bankAccountHolder}
            </p>
          </div>
          <CheckIcon className="h-5 w-5 shrink-0 text-[var(--success)]" />
        </div>
      )}

      {pendingWithdrawal && (
        <div className="rounded-xl bg-[var(--warning)]/18 px-4 py-3.5">
          <p className="text-sm font-extrabold text-[#9A6B00]">Yêu cầu đang xử lý</p>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            {formatVnd(pendingWithdrawal.amount)} · Đang chờ duyệt
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Mỗi lần chỉ có thể mở một yêu cầu. Hãy đợi admin xử lý xong trước khi tạo yêu cầu mới.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="rounded-full bg-[var(--accent)] py-3.5 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105 disabled:opacity-50"
      >
        {submitting ? "Đang gửi…" : "Xác nhận thanh toán"}
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdraw-confirm-title"
            className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5"
          >
            <h3 id="withdraw-confirm-title" className="text-base font-extrabold text-[var(--foreground)]">
              Xác nhận thanh toán
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Rút <span className="font-extrabold text-[var(--accent)]">{formatVnd(total)}</span>
              {coinAmount > 0 && ` (${formatVnd(amountNumber)} tiền hoàn + ${coinAmount.toLocaleString("vi-VN")} xu)`} về{" "}
              {user.bankName} · {user.bankAccountNumber} ({user.bankAccountHolder})?
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-full border border-[var(--border)] py-2.5 text-sm font-bold text-[var(--foreground)]"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={submit}
                className="flex-1 rounded-full bg-[var(--accent)] py-2.5 text-sm font-extrabold text-[var(--accent-foreground)]"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

function translate(message: string): string {
  if (message.startsWith("so tien toi thieu la")) {
    const min = Number(message.replace(/\D/g, ""));
    return `Số tiền tối thiểu là ${formatVnd(min)}.`;
  }
  switch (message) {
    case "missing_bank_info":
      return "Bạn cần cập nhật thông tin ngân hàng trước khi thanh toán.";
    case "a withdrawal request is already pending":
      return "Bạn đang có một yêu cầu chờ duyệt.";
    case "amount exceeds available balance or another request is already open":
      return "Số tiền vượt quá số dư khả dụng hoặc bạn đang có yêu cầu khác.";
    case "body.amount must be a positive number":
      return "Số tiền không hợp lệ.";
    case "body.coinAmount must be a positive whole number":
      return "Số xu không hợp lệ.";
    case "coin_withdraw_disabled":
      return "Tính năng rút xu đang tạm tắt.";
    case "coin_amount_exceeds_balance":
      return "Số xu vượt quá số xu khả dụng.";
    default:
      return message || "Vui lòng thử lại.";
  }
}
