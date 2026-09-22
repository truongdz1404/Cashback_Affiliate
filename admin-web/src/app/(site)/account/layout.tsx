import { redirect } from "next/navigation";
import { appFetchSafe, getSessionUser } from "@/lib/appApi";
import type { WalletSummary } from "@/lib/appTypes";
import { displayName, formatDateTime } from "@/lib/format";
import { EMPTY_WALLET, walletTotals } from "@/lib/wallet";
import { accountFacts } from "@/components/account/menu";
import AccountSidebar from "@/components/account/AccountSidebar";

// Every account page reads live balances - nothing here may be cached.
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // proxy.js already blocks /account/* without a user_token cookie; this
  // catches the other case - a cookie that the backend no longer honours.
  // Sending such a visitor straight to /login would loop (proxy.js bounces
  // signed-in-looking visitors off /login), so the dead cookie goes first.
  const [user, wallet] = await Promise.all([
    getSessionUser(),
    appFetchSafe<WalletSummary>("/wallet", EMPTY_WALLET),
  ]);
  if (!user) redirect("/api/user/logout?next=" + encodeURIComponent("/login?next=/account"));

  // Formatted here, not in the client component: Node and the browser can
  // disagree on locale output and that shows up as a hydration warning.
  const updatedAt = formatDateTime(new Date());

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="gap-6 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start xl:gap-8">
        <div className="lg:sticky lg:top-24">
          <AccountSidebar
            name={displayName(user)}
            contact={user.phone ?? user.email ?? "Tài khoản Rewally"}
            totals={walletTotals(wallet)}
            updatedAt={updatedAt}
            facts={accountFacts(user, wallet)}
          />
        </div>
        <div className="mt-5 min-w-0 lg:mt-0">{children}</div>
      </div>
    </div>
  );
}
