import { Suspense } from "react";
import { appFetchSafe, getSessionUser } from "@/lib/appApi";
import type { ShoppingCategory } from "@/lib/appTypes";
import PublicHeaderClient from "@/components/PublicHeaderClient";

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

  return (
    <Suspense fallback={<div className="h-[69px] border-b border-[var(--border)] bg-[var(--surface)]" />}>
      <PublicHeaderClient
        user={user ? { fullName: user.fullName, phone: user.phone, email: user.email } : null}
        categories={categories.slice(0, NAV_CATEGORY_LIMIT).map((c) => c.category)}
      />
    </Suspense>
  );
}
