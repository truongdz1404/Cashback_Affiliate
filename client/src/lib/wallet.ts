import type { WalletSummary } from "@/lib/appTypes";

// What /app/wallet answers for a brand-new member, and the fallback every
// page uses when the backend is unreachable so a balance card still renders.
export const EMPTY_WALLET: WalletSummary = {
  paidOrders: 0,
  paidAmount: 0,
  unpaidOrders: 0,
  unpaidAmount: 0,
  pendingOrders: 0,
  pendingAmount: 0,
  paidThisMonth: 0,
  availableAmount: 0,
  minWithdrawAmount: 0,
  pendingWithdrawal: null,
};

export type WalletTotals = {
  /** Everything this member has ever earned: paid out + waiting + still in the wallet. */
  total: number;
  /** Can be withdrawn right now (lib/walletBalance.js on the backend). */
  available: number;
  /** Orders Shopee has not confirmed yet (display_order_status = 1). */
  pending: number;
  /** Already transferred to the member's bank. */
  withdrawn: number;
  /** Locked in an open withdrawal request, so not part of `available`. */
  reserved: number;
};

// The backend reports the pieces separately; the balance cards need one
// headline figure. A pending withdrawal is subtracted from `available` on the
// server, so it is added back here or the total would dip while the admin
// reviews the request.
export function walletTotals(wallet: WalletSummary): WalletTotals {
  const available = Math.max(wallet.availableAmount ?? 0, 0);
  const pending = Math.max(wallet.pendingAmount ?? 0, 0);
  const withdrawn = Math.max(wallet.paidAmount ?? 0, 0);
  const reserved = wallet.pendingWithdrawal?.amount ?? 0;
  return { total: available + pending + withdrawn + reserved, available, pending, withdrawn, reserved };
}
