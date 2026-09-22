import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { FAQ_GROUPS } from "@/lib/faq";
import { DATA_DELETION_URL, PRIVACY_URL } from "@/lib/site";
import {
  BankIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  InfoIcon,
  LinkIcon,
  ReceiptIcon,
  ShieldIcon,
  TrashIcon,
  WalletIcon,
} from "@/components/icons";

export const metadata: Metadata = {
  title: "Hỗ trợ & Hỏi đáp | Rewally",
  description: "Giải đáp về hoàn tiền, đơn hàng, rút tiền và tài khoản Rewally.",
};

// Only pages that exist. There is deliberately no hotline or support mailbox
// here - none is set up yet, and inventing one would strand people.
const QUICK_LINKS = [
  { href: "/guide", label: "Cách Rewally hoạt động", description: "5 bước từ dán link đến nhận tiền.", icon: InfoIcon },
  { href: "/account/orders", label: "Kiểm tra đơn hàng", description: "Xem đơn đã ghi nhận và tiền hoàn.", icon: ReceiptIcon },
  { href: "/account/wallet", label: "Rút tiền", description: "Tạo yêu cầu và theo dõi trạng thái.", icon: WalletIcon },
  { href: "/account/bank", label: "Tài khoản ngân hàng", description: "Cập nhật nơi nhận tiền hoàn.", icon: BankIcon },
  { href: "/link", label: "Tạo link hoàn tiền", description: "Dán link Shopee, nhận link của bạn.", icon: LinkIcon },
];

const LEGAL_LINKS = [
  { href: PRIVACY_URL, label: "Chính sách quyền riêng tư", icon: ShieldIcon },
  { href: DATA_DELETION_URL, label: "Yêu cầu xoá dữ liệu tài khoản", icon: TrashIcon },
];

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-[var(--foreground)] sm:text-3xl">
            Hỗ trợ &amp; <span className="text-[var(--accent)]">Hỏi đáp</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
            Câu trả lời cho những thắc mắc hay gặp về hoàn tiền, đơn hàng, rút tiền và tài khoản.
          </p>
        </div>
        <Image src="/mascot.png" alt="" width={110} height={110} className="shrink-0" />
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_LINKS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-dark)] transition group-hover:bg-[var(--accent)] group-hover:text-white">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-extrabold text-[var(--foreground)]">{label}</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">{description}</span>
            </span>
          </Link>
        ))}
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="flex flex-col gap-8">
          {FAQ_GROUPS.map((group) => (
            <div key={group.title}>
              <h2 className="text-lg font-extrabold text-[var(--foreground)]">{group.title}</h2>
              <div className="mt-3 space-y-2.5">
                {group.items.map((faq) => (
                  // <details> keeps the accordion working without any client JS.
                  <details
                    key={faq.question}
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
            </div>
          ))}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-extrabold text-[var(--foreground)]">Chính sách & dữ liệu</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {LEGAL_LINKS.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background)]"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                    <span className="min-w-0 flex-1">{label}</span>
                    <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-[var(--accent-soft)] p-5">
            <h2 className="text-sm font-extrabold text-[var(--accent-dark)]">Chưa tìm được câu trả lời?</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground)]">
              Đọc kỹ hướng dẫn từng bước hoặc kiểm tra lại trạng thái đơn trong tài khoản. Phần lớn thắc mắc về tiền
              hoàn nằm ở việc đơn chưa được Shopee đối soát.
            </p>
            <Link
              href="/guide"
              className="mt-4 inline-flex h-10 items-center rounded-full bg-[var(--accent)] px-5 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105"
            >
              Xem hướng dẫn
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}
