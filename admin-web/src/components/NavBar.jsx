"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clientApi } from "@/lib/clientApi";

const LINKS = [
  { href: "/", label: "Tổng quan" },
  { href: "/orders", label: "Đơn hàng" },
  { href: "/customers", label: "Khách hàng" },
  { href: "/campaigns", label: "Sự kiện" },
  { href: "/withdrawals", label: "Rút tiền" },
  { href: "/settings", label: "Cài đặt" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await clientApi.post("/api/logout");
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-8">
          <span className="text-base font-semibold text-slate-900">Shopee Affiliate Admin</span>
          <nav className="flex gap-1">
            {LINKS.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active ? "bg-orange-50 text-orange-600" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <button onClick={logout} className="text-sm font-medium text-slate-500 hover:text-slate-800">
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
