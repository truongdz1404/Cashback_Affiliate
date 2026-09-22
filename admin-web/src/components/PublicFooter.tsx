import Image from "next/image";
import Link from "next/link";
import { PLAY_STORE_URL } from "@/lib/site";
import { DownloadIcon } from "@/components/icons";

const COLUMNS = [
  {
    title: "Khám phá",
    links: [
      { href: "/", label: "Trang chủ" },
      { href: "/products", label: "Mua sắm hoàn tiền" },
      { href: "/campaigns", label: "Ưu đãi & Sự kiện" },
      { href: "/guide", label: "Cách hoạt động" },
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
    title: "Hỗ trợ",
    links: [
      { href: "/guide", label: "Hướng dẫn sử dụng" },
      { href: "/app/legal/privacy", label: "Chính sách quyền riêng tư", external: true },
      { href: "/app/legal/data-deletion", label: "Yêu cầu xóa dữ liệu", external: true },
    ],
  },
];

export default function PublicFooter() {
  return (
    <footer className="bg-black text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-6 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Rewally" width={36} height={36} className="rounded-lg bg-white" />
            <span className="text-base font-extrabold tracking-tight">Rewally</span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/68">
            Nền tảng hoàn tiền khi mua sắm Shopee. Mua qua Rewally, theo dõi đơn hàng và rút tiền về ngân hàng sau đối
            soát.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Image
              src="/play-store-qr.png"
              alt="Mã QR tải app Rewally"
              width={68}
              height={68}
              className="rounded-xl border border-white/12 bg-white p-1"
            />
            <Link
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-extrabold text-black transition hover:bg-white/90"
            >
              <DownloadIcon className="h-4 w-4" />
              Tải app
            </Link>
          </div>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h3 className="text-sm font-extrabold">{column.title}</h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  {"external" in link && link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-white/62 transition hover:text-white"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="text-sm font-medium text-white/62 transition hover:text-white">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-white/54 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Rewally. Nền tảng hoàn tiền mua sắm.</p>
          <p>Rewally là đối tác tiếp thị liên kết, không phải Shopee.</p>
        </div>
      </div>
    </footer>
  );
}
