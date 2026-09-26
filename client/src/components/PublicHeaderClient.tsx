"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Button, Chip } from "@heroui/react";
import { openAuthDialog } from "@/lib/authDialog";
import type { WalletTotals } from "@/lib/wallet";
import { formatVnd } from "@/lib/format";
import BalanceCard from "@/components/account/BalanceCard";
import { accountMenu, isMenuActive, type AccountFacts, type AccountMenuItem } from "@/components/account/menu";
import {
  ArrowRightIcon,
  BagIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  GiftIcon,
  HomeIcon,
  InfoIcon,
  LinkIcon,
  LogoutIcon,
  MenuIcon,
  SearchIcon,
} from "@/components/icons";

export type HeaderUser = {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  totals: WalletTotals;
  facts: AccountFacts;
} | null;

// "Tạo link" is the money-making action, so it sits in the primary nav for
// guests and members alike (highlighted, see `emphasis`) rather than being
// tucked away under the account menu.
const NAV = [
  { href: "/", label: "Trang chủ", icon: HomeIcon },
  { href: "/products", label: "Mua sắm", icon: BagIcon },
  { href: "/link", label: "Tạo link", icon: LinkIcon, emphasis: true },
  { href: "/campaigns", label: "Ưu đãi", icon: GiftIcon },
  { href: "/guide", label: "Cách hoạt động", icon: InfoIcon },
];

const BADGE_DOT = {
  danger: "bg-[var(--danger)]",
  warning: "bg-[var(--warning)]",
  accent: "bg-[var(--accent)]",
} as const;

function initialOf(user: NonNullable<HeaderUser>) {
  const source = user.fullName || user.phone || user.email || "R";
  return source.trim().charAt(0).toUpperCase();
}

// The dropdown mirrors ShopBack's grouping: promotions, then the account
// pages, then "how it works", then help + sign out. The dashboard entry only
// exists in `items` for admins (accountMenu), so its group is empty - and
// therefore dropped - for everyone else.
function menuGroups(items: AccountMenuItem[]): AccountMenuItem[][] {
  const byHref = new Map(items.map((item) => [item.href, item]));
  const pick = (...hrefs: string[]) => hrefs.map((href) => byHref.get(href)).filter((i): i is AccountMenuItem => Boolean(i));
  return [
    pick("/admin"),
    [{ href: "/campaigns", label: "Ưu đãi & sự kiện", icon: GiftIcon }],
    pick("/account", "/account/profile", "/account/bank", "/account/password", "/account/wallet", "/account/orders", "/account/referral"),
    [{ href: "/guide", label: "Cách Rewally hoạt động", icon: InfoIcon }],
    pick("/support"),
  ].filter((group) => group.length > 0);
}

export default function PublicHeaderClient({ user, categories }: { user: HeaderUser; categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("search") ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  const accountItems = useMemo(() => (user ? accountMenu(user.facts) : []), [user]);
  const groups = useMemo(() => menuGroups(accountItems), [accountItems]);
  const attention = accountItems.filter((item) => item.badge && item.badge.tone !== "accent").length;

  useEffect(() => {
    setQuery(searchParams.get("search") ?? "");
  }, [searchParams]);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen && !menuOpen) return;
    function onClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAccountOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen, menuOpen]);

  // The drawer covers the page; stop the page scrolling underneath it.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const term = query.trim();
    router.push(term ? `/products?search=${encodeURIComponent(term)}` : "/products");
  }

  async function logout() {
    await fetch("/api/user/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const pillClass =
    "relative inline-flex h-10 items-center gap-2 rounded-full border pl-1 pr-2.5 text-sm font-extrabold text-[var(--foreground)] transition";
  const pillFace = user && (
    <>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-extrabold text-white">
        {initialOf(user)}
      </span>
      <span className="tabular-nums">{formatVnd(user.totals.available)}</span>
      {attention > 0 && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--danger)] ring-2 ring-white" />
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6 lg:gap-6 lg:py-3 xl:gap-8">
        <Button
          type="button"
          aria-label="Mở menu"
          onPress={() => setMenuOpen(true)}
          variant="tertiary"
          size="sm"
          isIconOnly
          className="-ml-2 lg:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </Button>

        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src="/logo.png" alt="Rewally" width={38} height={38} className="rounded-lg" priority />
          <span className="hidden text-lg font-extrabold tracking-tight text-[var(--foreground)] sm:inline">Rewally</span>
        </Link>

        <nav className="hidden items-center gap-2 lg:flex xl:gap-3">
          {NAV.map(({ href, label, icon: Icon, emphasis }) => (
            <Link
              key={href}
              href={href}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-bold transition ${
                isActive(href)
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : emphasis
                    ? "text-[var(--accent-dark)] ring-1 ring-[var(--accent)]/45 hover:bg-[var(--accent-soft)]"
                    : "text-[var(--foreground)] hover:bg-[var(--surface-secondary)]"
              }`}
            >
              {emphasis && <Icon className="h-4 w-4" />}
              {label}
            </Link>
          ))}
        </nav>

        <form onSubmit={submitSearch} className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)] sm:left-3.5" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm kiếm"
            aria-label="Tìm sản phẩm hoàn tiền"
            className="h-10 w-full rounded-full border border-[var(--border)] bg-[var(--background)] pl-9 pr-3 sm:pl-10 text-sm font-medium text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:bg-white sm:pr-20"
          />
          {/* On phones the field is only a few characters wide, so the
              keyboard's search key submits instead of a visible button. */}
          <button
            type="submit"
            className="absolute right-1 top-1/2 hidden h-8 -translate-y-1/2 rounded-full bg-[var(--accent)] px-3 text-xs font-extrabold text-white transition hover:brightness-105 sm:block"
          >
            Tìm
          </button>
        </form>

        {user ? (
          <div ref={accountRef} className="relative shrink-0">
            {/* Phones get the pill as a plain link to the overview: the drawer
                behind the hamburger already carries this menu item for item,
                down to the same balance card and sign-out. */}
            <span className="lg:hidden">
              <Link href="/account" aria-label="Tài khoản và số dư" className={`${pillClass} border-[var(--border)] bg-white`}>
                {pillFace}
                <ChevronRightIcon className="h-4 w-4 text-[var(--muted)]" />
              </Link>
            </span>

            {/* Trigger: avatar + available balance, like ShopBack's "0đ ▾" pill. */}
            <span className="hidden lg:inline">
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                aria-label="Tài khoản và số dư"
                className={`${pillClass} ${
                  accountOpen
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-white hover:border-[var(--accent)]"
                }`}
              >
                {pillFace}
                <ChevronDownIcon className={`h-4 w-4 text-[var(--muted)] transition ${accountOpen ? "rotate-180" : ""}`} />
              </button>
            </span>

            {accountOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-3 w-[min(20rem,calc(100vw-2rem))] rounded-[22px] border border-[var(--border)] bg-white p-3 shadow-[0_22px_56px_-30px_rgba(20,49,34,0.7)]"
              >
                {/* Caret */}
                <span className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 border-l border-t border-[var(--border)] bg-white" />

                <Link href="/account" className="flex items-center gap-3 rounded-2xl px-2 py-1.5 transition hover:bg-[var(--background)]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-extrabold text-[var(--accent-dark)]">
                    {initialOf(user)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-[var(--foreground)]">
                      {user.fullName || user.phone || "Tài khoản Rewally"}
                    </span>
                    <span className="block truncate text-xs text-[var(--muted)]">{user.phone ?? user.email ?? "Xem tài khoản"}</span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                </Link>

                <div className="mt-2">
                  <BalanceCard totals={user.totals} variant="compact" />
                </div>

                <div className="mt-2 max-h-[min(24rem,calc(100vh-22rem))] overflow-y-auto">
                  {groups.map((group, index) => (
                    <div key={index} className={index > 0 ? "mt-1 border-t border-[var(--border)] pt-1" : ""}>
                      {group.map(({ href, label, short, icon: Icon, badge }) => (
                        <Link
                          key={href}
                          href={href}
                          role="menuitem"
                          className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-semibold transition hover:bg-[var(--background)] ${
                            isMenuActive(pathname, href) ? "text-[var(--accent-dark)]" : "text-[var(--foreground)]"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                          <span className="min-w-0 flex-1 truncate">{href.startsWith("/account/") ? label : short ?? label}</span>
                          {badge && <span className={`h-2 w-2 shrink-0 rounded-full ${BADGE_DOT[badge.tone]}`} title={badge.label} />}
                        </Link>
                      ))}
                    </div>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={logout}
                    className="mt-1 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/6"
                  >
                    <LogoutIcon className="h-4 w-4" />
                    Đăng xuất
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            {/* Buttons, not links: sign-in is a dialog over the current page
                now, and an href to /login would only bounce through a redirect
                (see proxy.js) to end up in the same place. */}
            <button
              type="button"
              onClick={() => openAuthDialog({ mode: "login" })}
              className="hidden px-2 text-sm font-extrabold text-[var(--foreground)] transition hover:text-[var(--accent)] sm:inline"
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => openAuthDialog({ mode: "register" })}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--foreground)] px-4 text-sm font-extrabold text-white transition hover:opacity-90"
            >
              Đăng ký
              <ArrowRightIcon className="hidden h-4 w-4 sm:block" />
            </button>
          </div>
        )}
      </div>

      {categories.length > 0 && (
        <div className="hidden border-t border-[var(--border)] lg:block">
          <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-6 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((category) => (
              <Link key={category} href={`/products?category=${encodeURIComponent(category)}`} className="shrink-0">
                <Chip variant="soft" size="sm" className="bg-[var(--surface-secondary)] text-[var(--foreground)]">
                  {category}
                </Chip>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Portalled: the header's backdrop-blur makes it the containing block
          for fixed descendants, which would clip the drawer to header height. */}
      {menuOpen &&
        createPortal(
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-[min(20rem,85vw)] flex-col overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <Image src="/logo.png" alt="Rewally" width={32} height={32} className="rounded-lg" />
                <span className="font-extrabold text-[var(--foreground)]">Rewally</span>
              </Link>
              <Button type="button" aria-label="Đóng menu" onPress={() => setMenuOpen(false)} variant="tertiary" size="sm" isIconOnly>
                <CloseIcon className="h-5 w-5" />
              </Button>
            </div>

            {user && (
              <Link href="/account" className="mt-5 flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-extrabold text-white">
                  {initialOf(user)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-[var(--foreground)]">
                    {user.fullName || user.phone || "Tài khoản Rewally"}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">{user.phone ?? user.email ?? ""}</span>
                </span>
                <ChevronRightIcon className="h-4 w-4 text-[var(--muted)]" />
              </Link>
            )}
            {user && (
              <div className="mt-3">
                <BalanceCard totals={user.totals} variant="compact" />
              </div>
            )}

            <div className="mt-5 flex flex-col gap-1">
              {NAV.map(({ href, label, icon: Icon, emphasis }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold ${
                    isActive(href)
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : emphasis
                        ? "text-[var(--accent-dark)] ring-1 ring-[var(--accent)]/45"
                        : "text-[var(--foreground)]"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  {label}
                </Link>
              ))}
            </div>

            {user ? (
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <p className="px-3 pb-2 text-xs font-bold uppercase text-[var(--muted)]">Tài khoản</p>
                {accountItems.map(({ href, label, icon: Icon, badge }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                      isMenuActive(pathname, href) ? "bg-[var(--accent-soft)] text-[var(--accent-dark)]" : "text-[var(--foreground)]"
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0 text-[var(--muted)]" />
                    <span className="min-w-0 flex-1">{label}</span>
                    {badge && <span className={`h-2 w-2 shrink-0 rounded-full ${BADGE_DOT[badge.tone]}`} title={badge.label} />}
                  </Link>
                ))}
                <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--danger)]">
                  <LogoutIcon className="h-4.5 w-4.5" />
                  Đăng xuất
                </button>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-2 border-t border-[var(--border)] pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openAuthDialog({ mode: "login" });
                  }}
                  className="rounded-full border border-[var(--border)] px-4 py-2.5 text-center text-sm font-extrabold text-[var(--foreground)]"
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openAuthDialog({ mode: "register" });
                  }}
                  className="rounded-full bg-[var(--foreground)] px-4 py-2.5 text-center text-sm font-extrabold text-white"
                >
                  Đăng ký miễn phí
                </button>
                <Link href="/support" className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--foreground)]">
                  <InfoIcon className="h-4.5 w-4.5 text-[var(--muted)]" />
                  Hỗ trợ &amp; Hỏi đáp
                </Link>
              </div>
            )}

            {categories.length > 0 && (
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <p className="px-3 pb-2 text-xs font-bold uppercase text-[var(--muted)]">Danh mục</p>
                <div className="flex flex-wrap gap-2 px-3">
                  {categories.map((category) => (
                    <Link
                      key={category}
                      href={`/products?category=${encodeURIComponent(category)}`}
                      className="rounded-full bg-[var(--surface-secondary)] px-3 py-1.5 text-xs font-bold text-[var(--foreground)]"
                    >
                      {category}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </header>
  );
}
