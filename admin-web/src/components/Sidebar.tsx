"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clientApi } from "@/lib/clientApi";
import {
  BagIcon,
  GearIcon,
  GridIcon,
  ImageIcon,
  LogoutIcon,
  MegaphoneIcon,
  ReceiptIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/icons";

const LINKS = [
  { href: "/", label: "Tổng quan", icon: GridIcon },
  { href: "/orders", label: "Đơn hàng", icon: ReceiptIcon },
  { href: "/customers", label: "Khách hàng", icon: UsersIcon },
  { href: "/campaigns", label: "Sự kiện", icon: MegaphoneIcon },
  { href: "/products", label: "Sản phẩm", icon: BagIcon },
  { href: "/banners", label: "Banner", icon: ImageIcon },
  { href: "/withdrawals", label: "Rút tiền", icon: WalletIcon },
  { href: "/settings", label: "Cài đặt", icon: GearIcon },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await clientApi.post("/api/logout");
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col bg-[var(--surface)]">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-foreground)]">
          SA
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-[var(--foreground)]">Shopee Affiliate</p>
          <p className="text-xs text-[var(--muted)]">Admin</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
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
