import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Trang không tồn tại | Rewally" };

// Root 404. Also what /admin/* renders for anyone who is not an admin (see
// src/app/admin/layout.tsx), so it must look like every other missing page:
// self-contained, no site header (that would need the session), no hint of
// what might have lived here.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-6 text-center">
      <Link href="/" className="flex items-center gap-2.5 text-[var(--foreground)]">
        <Image src="/logo.png" alt="Rewally" width={44} height={44} className="rounded-xl" priority />
        <span className="text-xl font-extrabold tracking-tight">Rewally</span>
      </Link>
      <p className="mt-10 text-7xl font-extrabold text-[var(--accent)]">404</p>
      <h1 className="mt-3 text-xl font-bold text-[var(--foreground)]">Trang không tồn tại</h1>
      <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
        Đường dẫn bạn mở không có trên Rewally hoặc đã bị gỡ. Kiểm tra lại địa chỉ hoặc quay về trang chủ.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--accent-dark)]"
        >
          Về trang chủ
        </Link>
        <Link
          href="/products"
          className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-6 py-2.5 text-sm font-bold text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)]"
        >
          Mua sắm hoàn tiền
        </Link>
      </div>
    </main>
  );
}
