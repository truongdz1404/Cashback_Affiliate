import Image from "next/image";
import Link from "next/link";
import { PLAY_STORE_URL } from "@/lib/site";

// Deliberately links only to pages that really exist: the site's own routes
// and the two legal pages served by playwright-service at /app/legal/*.
// No social profiles, office address or hotline is listed here because
// Rewally does not publish any - inventing them would be worse than an
// honest, shorter footer.
const COLUMNS = [
  {
    title: "Khám phá",
    links: [
      { href: "/", label: "Trang chủ" },
      { href: "/products", label: "Mua sắm hoàn tiền" },
      { href: "/campaigns", label: "Ưu đãi & Sự kiện" },
      { href: "/guide", label: "Hướng dẫn" },
    ],
  },
  {
    title: "Tài khoản",
    links: [
      { href: "/login", label: "Đăng nhập" },
      { href: "/register", label: "Đăng ký" },
      { href: "/account/wallet", label: "Ví hoàn tiền" },
      { href: "/account/orders", label: "Đơn hàng" },
      { href: "/account/referral", label: "Giới thiệu bạn bè" },
    ],
  },
  {
    title: "Hỗ trợ & Pháp lý",
    links: [
      { href: "/guide", label: "Hướng dẫn sử dụng" },
      { href: "/app/legal/privacy", label: "Chính sách quyền riêng tư", external: true },
      { href: "/app/legal/data-deletion", label: "Yêu cầu xoá dữ liệu", external: true },
    ],
  },
];

export default function PublicFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Rewally" width={40} height={40} className="rounded-xl" />
            <span className="text-lg font-extrabold tracking-tight text-[var(--foreground)]">Rewally</span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
            Mua sắm qua Rewally để nhận hoàn tiền cho đơn hàng Shopee. Tiền hoàn được cộng vào ví sau khi đơn hoàn tất
            và đối soát, rút về tài khoản ngân hàng của bạn.
          </p>

          <div className="mt-5 flex items-center gap-4">
            <Link
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-[var(--accent-foreground)] transition hover:brightness-105"
            >
              Tải app trên Google Play
            </Link>
            <Image
              src="/play-store-qr.png"
              alt="Mã QR tải app Rewally trên Google Play"
              width={64}
              height={64}
              className="rounded-lg border border-[var(--border)]"
            />
          </div>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h3 className="text-sm font-extrabold text-[var(--foreground)]">{column.title}</h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  {"external" in link && link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--muted)] transition hover:text-[var(--accent)]"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="text-sm text-[var(--muted)] transition hover:text-[var(--accent)]">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Rewally. Nền tảng hoàn tiền mua sắm.</p>
          <p>Rewally là đối tác tiếp thị liên kết, không phải Shopee. Tỉ lệ hoàn tiền do sàn quy định và có thể thay đổi.</p>
        </div>
      </div>
    </footer>
  );
}
