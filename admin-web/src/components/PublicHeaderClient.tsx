"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BagIcon,
  ChevronDownIcon,
  CloseIcon,
  GiftIcon,
  HomeIcon,
  InfoIcon,
  LinkIcon,
  LogoutIcon,
  MenuIcon,
  SearchIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/icons";

export type HeaderUser = { fullName: string | null; phone: string | null; email: string | null } | null;

const NAV = [
  { href: "/", label: "Trang chủ", icon: HomeIcon },
  { href: "/products", label: "Mua sắm hoàn tiền", icon: BagIcon },
  { href: "/campaigns", label: "Ưu đãi & Sự kiện", icon: GiftIcon },
  { href: "/guide", label: "Hướng dẫn", icon: InfoIcon },
];

const ACCOUNT_MENU = [
  { href: "/account", label: "Tổng quan", icon: HomeIcon },
  { href: "/account/wallet", label: "Ví hoàn tiền", icon: WalletIcon },
  { href: "/account/orders", label: "Đơn hàng", icon: BagIcon },
  { href: "/account/links", label: "Tạo link", icon: LinkIcon },
  { href: "/account/referral", label: "Giới thiệu bạn bè", icon: UsersIcon },
  { href: "/account/profile", label: "Tài khoản", icon: UsersIcon },
];

function initialOf(user: NonNullable<HeaderUser>) {
  const source = user.fullName || user.phone || user.email || "R";
  return source.trim().charAt(0).toUpperCase();
}

export default function PublicHeaderClient({ user, categories }: { user: HeaderUser; categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("search") ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // Keep the box in step with the URL when the catalog page changes it (back
  // button, a category chip, a suggestion) instead of stranding a stale term.
  useEffect(() => {
    setQuery(searchParams.get("search") ?? "");
  }, [searchParams]);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen) return;
    function onClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [accountOpen]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = query.trim();
    router.push(term ? `/products?search=${encodeURIComponent(term)}` : "/products");
  }

  async function logout() {
    await fetch("/api/user/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:gap-5">
        <button
          type="button"
          aria-label="Mở menu"
          onClick={() => setMenuOpen(true)}
          className="-ml-1 rounded-lg p-2 text-[var(--foreground)] lg:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src="/logo.png" alt="Rewally" width={36} height={36} className="rounded-xl" priority />
          <span className="hidden text-lg font-extrabold tracking-tight text-[var(--foreground)] sm:inline">Rewally</span>
        </Link>

        <form onSubmit={submitSearch} className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm sản phẩm hoàn tiền..."
            aria-label="Tìm sản phẩm hoàn tiền"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--background)] py-2.5 pl-10 pr-24 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:bg-[var(--surface)]"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-bold text-[var(--accent-foreground)] transition hover:brightness-105"
          >
            Tìm kiếm
          </button>
        </form>

        {user ? (
          <div ref={accountRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setAccountOpen((v) => !v)}
              aria-expanded={accountOpen}
              className="flex items-center gap-2 rounded-full border border-[var(--border)] py-1.5 pl-1.5 pr-2.5 transition hover:border-[var(--accent)]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-extrabold text-[var(--accent-foreground)]">
                {initialOf(user)}
              </span>
              <span className="hidden max-w-[9rem] truncate text-sm font-semibold text-[var(--foreground)] sm:inline">
                {user.fullName || user.phone || "Tài khoản"}
              </span>
              <ChevronDownIcon className="h-4 w-4 text-[var(--muted)]" />
            </button>

            {accountOpen && (
              <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-1.5 shadow-[0_20px_50px_-20px_rgba(30,42,36,0.4)]">
                {ACCOUNT_MENU.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)]"
                  >
                    <Icon className="h-4 w-4 text-[var(--muted)]" />
                    {label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={logout}
                  className="mt-1 flex w-full items-center gap-3 border-t border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--danger)] transition hover:bg-[var(--surface-secondary)]"
                >
                  <LogoutIcon className="h-4 w-4" />
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-full px-4 py-2 text-sm font-bold text-[var(--foreground)] transition hover:text-[var(--accent)] sm:inline-flex"
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent-foreground)] transition hover:brightness-105 sm:px-5"
            >
              Đăng ký
            </Link>
          </div>
        )}
      </div>

      <nav className="hidden border-t border-[var(--border)] lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-6">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition ${
                isActive(href)
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--foreground)] hover:text-[var(--accent)]"
              }`}
            >
              {label}
            </Link>
          ))}
          {categories.length > 0 && <span className="mx-2 h-4 w-px bg-[var(--border)]" />}
          {categories.map((category) => (
            <Link
              key={category}
              href={`/products?category=${encodeURIComponent(category)}`}
              className="shrink-0 border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--accent)]"
            >
              {category}
            </Link>
          ))}
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between">
              <Image src="/logo.png" alt="Rewally" width={32} height={32} className="rounded-lg" />
              <button type="button" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} className="p-2">
                <CloseIcon className="h-5 w-5 text-[var(--foreground)]" />
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-1">
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                    isActive(href) ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--foreground)]"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  {label}
                </Link>
              ))}
            </div>

            {user ? (
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Tài khoản</p>
                {ACCOUNT_MENU.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--foreground)]"
                  >
                    <Icon className="h-4.5 w-4.5 text-[var(--muted)]" />
                    {label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--danger)]"
                >
                  <LogoutIcon className="h-4.5 w-4.5" />
                  Đăng xuất
                </button>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-2 border-t border-[var(--border)] pt-4">
                <Link
                  href="/login"
                  className="rounded-full border-2 border-[var(--accent)] px-4 py-2.5 text-center text-sm font-bold text-[var(--accent)]"
                >
                  Đăng nhập
                </Link>
                <Link
                  href="/register"
                  className="rounded-full bg-[var(--accent)] px-4 py-2.5 text-center text-sm font-bold text-[var(--accent-foreground)]"
                >
                  Đăng ký miễn phí
                </Link>
              </div>
            )}

            {categories.length > 0 && (
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Danh mục</p>
                <div className="flex flex-wrap gap-2 px-3">
                  {categories.map((category) => (
                    <Link
                      key={category}
                      href={`/products?category=${encodeURIComponent(category)}`}
                      className="rounded-full bg-[var(--surface-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)]"
                    >
                      {category}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
