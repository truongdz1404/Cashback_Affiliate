"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Chip } from "@heroui/react";
import {
  ArrowRightIcon,
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
  { href: "/products", label: "Mua sắm", icon: BagIcon },
  { href: "/campaigns", label: "Ưu đãi", icon: GiftIcon },
  { href: "/guide", label: "Cách hoạt động", icon: InfoIcon },
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

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6 lg:gap-4">
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
          <Image src="/logo.png" alt="Rewally" width={34} height={34} className="rounded-lg" priority />
          <span className="hidden text-base font-extrabold tracking-tight text-[var(--foreground)] sm:inline">Rewally</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
                isActive(href)
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--foreground)] hover:bg-[var(--surface-secondary)]"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <form onSubmit={submitSearch} className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm sản phẩm hoàn tiền..."
            aria-label="Tìm sản phẩm hoàn tiền"
            className="h-10 w-full rounded-full border border-[var(--border)] bg-[var(--background)] pl-10 pr-20 text-sm font-medium text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:bg-white"
          />
          <button
            type="submit"
            className="absolute right-1 top-1/2 h-8 -translate-y-1/2 rounded-full bg-[var(--accent)] px-3 text-xs font-extrabold text-white transition hover:brightness-105"
          >
            Tìm
          </button>
        </form>

        {user ? (
          <div ref={accountRef} className="relative shrink-0">
            <Button
              type="button"
              onPress={() => setAccountOpen((v) => !v)}
              aria-expanded={accountOpen}
              variant="outline"
              size="sm"
              className="h-10 rounded-full px-1.5 pr-2.5"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-extrabold text-white">
                {initialOf(user)}
              </span>
              <span className="hidden max-w-[8rem] truncate text-sm font-bold sm:inline">
                {user.fullName || user.phone || "Tài khoản"}
              </span>
              <ChevronDownIcon className="h-4 w-4 text-[var(--muted)]" />
            </Button>

            {accountOpen && (
              <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-[var(--border)] bg-white py-1.5 shadow-[0_22px_56px_-30px_rgba(20,49,34,0.7)]">
                {ACCOUNT_MENU.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)]"
                  >
                    <Icon className="h-4 w-4 text-[var(--muted)]" />
                    {label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={logout}
                  className="mt-1 flex w-full items-center gap-3 border-t border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--surface-secondary)]"
                >
                  <LogoutIcon className="h-4 w-4" />
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/login" className="hidden px-2 text-sm font-extrabold text-[var(--foreground)] transition hover:text-[var(--accent)] sm:inline">
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--foreground)] px-4 text-sm font-extrabold text-white transition hover:opacity-90"
            >
              Đăng ký
              <ArrowRightIcon className="hidden h-4 w-4 sm:block" />
            </Link>
          </div>
        )}
      </div>

      {categories.length > 0 && (
        <div className="hidden border-t border-[var(--border)] lg:block">
          <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-6 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <Image src="/logo.png" alt="Rewally" width={32} height={32} className="rounded-lg" />
                <span className="font-extrabold text-[var(--foreground)]">Rewally</span>
              </Link>
              <Button type="button" aria-label="Đóng menu" onPress={() => setMenuOpen(false)} variant="tertiary" size="sm" isIconOnly>
                <CloseIcon className="h-5 w-5" />
              </Button>
            </div>

            <div className="mt-5 flex flex-col gap-1">
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold ${
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
                <p className="px-3 pb-2 text-xs font-bold uppercase text-[var(--muted)]">Tài khoản</p>
                {ACCOUNT_MENU.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--foreground)]">
                    <Icon className="h-4.5 w-4.5 text-[var(--muted)]" />
                    {label}
                  </Link>
                ))}
                <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--danger)]">
                  <LogoutIcon className="h-4.5 w-4.5" />
                  Đăng xuất
                </button>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-2 border-t border-[var(--border)] pt-4">
                <Link href="/login" className="rounded-full border border-[var(--border)] px-4 py-2.5 text-center text-sm font-extrabold text-[var(--foreground)]">
                  Đăng nhập
                </Link>
                <Link href="/register" className="rounded-full bg-[var(--foreground)] px-4 py-2.5 text-center text-sm font-extrabold text-white">
                  Đăng ký miễn phí
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
        </div>
      )}
    </header>
  );
}
