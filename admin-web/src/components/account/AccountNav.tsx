"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BagIcon, HomeIcon, LinkIcon, LogoutIcon, UsersIcon, WalletIcon } from "@/components/icons";

const ITEMS = [
  { href: "/account", label: "Tổng quan", icon: HomeIcon },
  { href: "/account/wallet", label: "Ví hoàn tiền", icon: WalletIcon },
  { href: "/account/orders", label: "Đơn hàng", icon: BagIcon },
  { href: "/account/links", label: "Tạo link", icon: LinkIcon },
  { href: "/account/referral", label: "Giới thiệu bạn bè", icon: UsersIcon },
  { href: "/account/profile", label: "Tài khoản", icon: UsersIcon },
];

// /account is the only prefix of the others, so it has to match exactly or
// every page would light it up as well as its own entry.
function isActive(pathname: string, href: string) {
  return href === "/account" ? pathname === "/account" : pathname.startsWith(href);
}

export default function AccountNav() {
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/user/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }

  return (
    <nav aria-label="Khu vực tài khoản">
      {/* Horizontal scroller on phones, sticky rail from lg up. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-semibold transition lg:rounded-xl ${
                active
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)] lg:bg-[var(--accent-soft)] lg:text-[var(--accent-dark)]"
                  : "bg-[var(--surface)] text-[var(--foreground)] hover:text-[var(--accent)] lg:bg-transparent"
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
              {label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={logout}
          className="flex shrink-0 items-center gap-2.5 rounded-full bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] transition lg:mt-2 lg:rounded-xl lg:border-t lg:border-[var(--border)] lg:bg-transparent lg:pt-4"
        >
          <LogoutIcon className="h-4.5 w-4.5" />
          Đăng xuất
        </button>
      </div>
    </nav>
  );
}
