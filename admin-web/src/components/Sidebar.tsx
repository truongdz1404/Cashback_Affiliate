"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BagIcon,
  GearIcon,
  GridIcon,
  HomeIcon,
  ImageIcon,
  LogoutIcon,
  MegaphoneIcon,
  ReceiptIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/icons";

export type AdminIdentity = { name: string; contact: string };

const LINKS = [
  { href: "/admin", label: "Tổng quan", icon: GridIcon },
  { href: "/admin/orders", label: "Đơn hàng", icon: ReceiptIcon },
  { href: "/admin/customers", label: "Khách hàng", icon: UsersIcon },
  { href: "/admin/campaigns", label: "Sự kiện", icon: MegaphoneIcon },
  { href: "/admin/products", label: "Sản phẩm", icon: BagIcon },
  { href: "/admin/banners", label: "Banner", icon: ImageIcon },
  { href: "/admin/withdrawals", label: "Rút tiền", icon: WalletIcon },
  { href: "/admin/settings", label: "Cài đặt", icon: GearIcon },
];

export default function Sidebar({ admin, onNavigate }: { admin: AdminIdentity; onNavigate?: () => void }) {
  const pathname = usePathname();

  // Same session as the public site, so signing out here signs out there
  // too - and the only sensible place to land afterwards is the home page.
  async function logout() {
    await fetch("/api/user/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }

  return (
    <div className="flex h-full flex-col bg-[var(--surface)]">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Image src="/logo.png" alt="Rewally" width={36} height={36} className="rounded-xl" />
        <div className="leading-tight">
          <p className="text-sm font-bold text-[var(--foreground)]">Rewally</p>
          <p className="text-xs text-[var(--muted)]">Quản trị</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {LINKS.map((l) => {
          const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
              }`}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" />
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] px-3 py-3">
        <div className="mb-2 flex items-center gap-2.5 px-3 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-[var(--accent-foreground)]">
            {admin.name.trim().charAt(0).toUpperCase() || "A"}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-[var(--foreground)]">{admin.name}</p>
            {admin.contact && <p className="truncate text-xs text-[var(--muted)]">{admin.contact}</p>}
          </div>
        </div>
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
        >
          <HomeIcon className="h-4.5 w-4.5" />
          Về trang chủ
        </Link>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger-soft-foreground)]"
        >
          <LogoutIcon className="h-4.5 w-4.5" />
          Đăng xuất
        </button>
      </div>
    </div>
  );
}
