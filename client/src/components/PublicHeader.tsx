import { Suspense } from "react";
import { appFetchSafe, getSessionUser } from "@/lib/appApi";
import type { ShoppingCategory, WalletSummary } from "@/lib/appTypes";
import { EMPTY_WALLET, walletTotals } from "@/lib/wallet";
import { accountFacts } from "@/components/account/menu";
import PublicHeaderClient, { type HeaderUser } from "@/components/PublicHeaderClient";

// Only categories with a meaningful number of products make it into the nav:
// the `category` column is backfilled gradually by the crawler, so a
// long-tail category with three rows would be a dead end for the visitor.
const NAV_CATEGORY_MIN_COUNT = 8;
const NAV_CATEGORY_LIMIT = 8;

export default async function PublicHeader() {
  const [user, categories] = await Promise.all([
    getSessionUser(),
    appFetchSafe<ShoppingCategory[]>(`/shopping-categories?minCount=${NAV_CATEGORY_MIN_COUNT}`, []),
  ]);

  // The balance pill in the header needs the wallet, but only for members.
  const wallet = user ? await appFetchSafe<WalletSummary>("/wallet", EMPTY_WALLET) : EMPTY_WALLET;

  const headerUser: HeaderUser = user
    ? {
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        totals: walletTotals(wallet),
        facts: accountFacts(user, wallet),
      }
    : null;

  return (
    <Suspense fallback={<div className="h-[69px] border-b border-[var(--border)] bg-[var(--surface)]" />}>
      <PublicHeaderClient
        user={headerUser}
        categories={categories.slice(0, NAV_CATEGORY_LIMIT).map((c) => c.category)}
      />
    </Suspense>
  );
}
