"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import type { WalletTotals } from "@/lib/wallet";
import BalanceCard from "@/components/account/BalanceCard";
import { accountMenu, isMenuActive, type AccountFacts } from "@/components/account/menu";
import { ChevronLeftIcon, ChevronRightIcon, LogoutIcon } from "@/components/icons";

const BADGE_TONE = {
  danger: "bg-[var(--danger)] text-white",
  warning: "bg-[var(--warning)] text-[#4A3600]",
  accent: "bg-white text-[var(--accent-dark)] ring-1 ring-[var(--accent)]/40",
} as const;

// Left column of every /account page: who you are, what you have earned, and
// where to go. On phones the whole column only shows on /account itself - a
// sub-page gets a back link plus a scrollable chip row so the content is
// visible without scrolling past the balance card first.
export default function AccountSidebar({
  name,
  contact,
  totals,
  updatedAt,
  facts,
}: {
  name: string;
  contact: string;
  totals: WalletTotals;
  updatedAt: string;
  // Plain booleans, not the menu itself: the menu items carry icon
  // components, which cannot cross the server -> client boundary.
  facts: AccountFacts;
}) {
  const pathname = usePathname();
  const items = useMemo(() => accountMenu(facts), [facts]);
  const onOverview = pathname === "/account";
  const current = items.find((item) => isMenuActive(pathname, item.href));

  async function logout() {
    await fetch("/api/user/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }

  const chipNav = (
    <nav aria-label="Khu vực tài khoản" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const active = isMenuActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition ${
              active
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-[var(--border)]"
            }`}
          >
            {item.short ?? item.label}
            {item.badge && !active && (
              <span className={`h-2 w-2 rounded-full ${item.badge.tone === "danger" ? "bg-[var(--danger)]" : item.badge.tone === "warning" ? "bg-[var(--warning)]" : "bg-[var(--accent)]"}`} />
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile: compact header for overview page — avatar + balance + chip nav. */}
      {onOverview && (
        <div className="lg:hidden">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-extrabold text-[var(--accent-dark)]">
              {name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-extrabold text-[var(--foreground)]">{name}</h1>
              <p className="truncate text-xs text-[var(--muted)]">{contact}</p>
            </div>
          </div>
          <div className="mt-3">
            <BalanceCard totals={totals} updatedAt={updatedAt} />
          </div>
          {chipNav}
        </div>
      )}

      {/* Mobile: compact header for sub-pages — back button + page title + chip nav. */}
      {!onOverview && (
        <div className="lg:hidden">
          <div className="flex items-center gap-2">
            <Link
              href="/account"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
              aria-label="Về tổng quan tài khoản"
            >
              <ChevronLeftIcon className="h-4.5 w-4.5" />
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Tài khoản</p>
              <h1 className="truncate text-lg font-extrabold text-[var(--foreground)]">{current?.label ?? name}</h1>
            </div>
          </div>
          {chipNav}
        </div>
      )}

      {/* Desktop full sidebar — always hidden on mobile. */}
      <aside className="hidden lg:block rounded-[26px] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-lg font-extrabold text-[var(--accent-dark)]">
            {name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold text-[var(--foreground)]">{name}</h1>
            <p className="truncate text-sm text-[var(--muted)]">{contact}</p>
          </div>
        </div>

        <div className="mt-4">
          <BalanceCard totals={totals} updatedAt={updatedAt} />
        </div>

        <nav aria-label="Khu vực tài khoản" className="mt-4 flex flex-col gap-0.5">
          {items.map(({ href, label, icon: Icon, badge }) => {
            const active = isMenuActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent-dark)]"
                    : "text-[var(--foreground)] hover:bg-[var(--background)]"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
                    active ? "bg-[var(--accent)] text-white" : "bg-[var(--background)] text-[var(--accent-dark)] group-hover:bg-[var(--accent-soft)]"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1 leading-tight">{label}</span>
                {badge && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${BADGE_TONE[badge.tone]}`}>
                    {badge.label}
                  </span>
                )}
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--muted)] lg:hidden" />
              </Link>
            );
          })}

          <button
            type="button"
            onClick={logout}
            className="mt-2 flex items-center gap-3 rounded-2xl border-t border-[var(--border)] px-3 pb-2 pt-4 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/6"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--danger)]/10">
              <LogoutIcon className="h-4.5 w-4.5" />
            </span>
            Đăng xuất
          </button>
        </nav>
      </aside>
    </>
  );
}
