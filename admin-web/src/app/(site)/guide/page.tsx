import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { FAQ_GROUPS } from "@/lib/faq";
import HowItWorks from "@/components/public/HowItWorks";
import { BagIcon, BoltIcon, CheckIcon, ChevronDownIcon, LinkIcon, ReceiptIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Hướng dẫn sử dụng | Rewally",
  description: "Cách mua sắm qua Rewally, tạo link hoàn tiền và nhận tiền về ví.",
};

// Copy kept verbatim from the mobile app's Hướng dẫn screen (src/app/guide.tsx)
// so both surfaces describe the same process.
const STEPS = [
  {
    icon: BagIcon,
    title: "Quy Trình Mua Sắm",
    description: "Bạn chọn sản phẩm trên sàn thương mại điện tử, sau đó sao chép link sản phẩm.",
  },
  {
    icon: ReceiptIcon,
    title: "Chọn Nền Tảng",
    description: "Mở Hoàn tiền, chọn sàn TMĐT phù hợp và dán link sản phẩm cần tạo.",
  },
  {
    icon: LinkIcon,
    title: "Dán Link Sản Phẩm",
    description: "Link hợp lệ sẽ được kiểm tra tự động, app sẽ tạo link hoàn tiền mới cho bạn.",
  },
  {
    icon: BoltIcon,
    title: "Lấy Link Ưu Đãi",
    description: "Mở link mới để mua sắm. Hoa hồng sẽ được ghi nhận khi đơn hàng hoàn tất.",
  },
  {
    icon: CheckIcon,
    title: "Mua Hàng & Nhận Ưu Đãi",
    description: "Theo dõi đơn hàng trong mục Đơn hàng và nhận thanh toán khi ví đủ điều kiện.",
  },
];

// The guide only shows the most common questions; /support has the full list.
const FAQS = FAQ_GROUPS.flatMap((group) => group.items).slice(0, 5);

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-[var(--foreground)] sm:text-3xl">
            Hướng Dẫn <span className="text-[var(--accent)]">Sử Dụng</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Tìm hiểu cách mua sắm và nhận ưu đãi hoàn tiền chỉ với vài thao tác đơn giản.
          </p>
        </div>
        <Image src="/mascot.png" alt="" width={110} height={110} className="shrink-0" />
      </header>

      <ol className="mt-9 space-y-0">
        {STEPS.map(({ icon: Icon, title, description }, index) => (
          <li key={title} className="flex gap-4">
            <div className="flex w-9 shrink-0 flex-col items-center">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-extrabold text-[var(--accent-foreground)]">
                {index + 1}
              </span>
              {index < STEPS.length - 1 && <span className="w-0.5 flex-1 bg-[var(--border)]" />}
            </div>
            <div className="mb-3 flex flex-1 items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <div>
                <h2 className="text-sm font-extrabold text-[var(--foreground)]">{title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{description}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <HowItWorks />

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-extrabold text-[var(--foreground)]">Câu hỏi thường gặp</h2>
          <Link href="/support" className="text-sm font-bold text-[var(--accent-dark)] underline-offset-4 hover:underline">
            Xem toàn bộ Hỗ trợ &amp; Hỏi đáp
          </Link>
        </div>
        <div className="mt-4 space-y-2.5">
          {FAQS.map((faq, index) => (
            // <details> keeps the accordion working without any client JS.
            <details
              key={faq.question}
              open={index === 0}
              className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-extrabold text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
                {faq.question}
                <ChevronDownIcon className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-3xl bg-[var(--accent)] px-6 py-8 text-center text-[var(--accent-foreground)]">
        <h2 className="text-xl font-extrabold">Sẵn sàng nhận hoàn tiền?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm opacity-90">
          Tạo tài khoản miễn phí trong một phút và bắt đầu tích tiền hoàn ngay từ đơn hàng tiếp theo.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href="/register"
            className="rounded-full bg-white px-6 py-3 text-sm font-extrabold text-[var(--accent)] transition hover:brightness-95"
          >
            Đăng ký miễn phí
          </Link>
          <Link
            href="/products"
            className="rounded-full border-2 border-white/70 px-6 py-3 text-sm font-extrabold transition hover:bg-white/10"
          >
            Xem sản phẩm hoàn tiền
          </Link>
        </div>
      </section>
    </div>
  );
}
