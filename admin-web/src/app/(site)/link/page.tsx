import Link from "next/link";
import type { Metadata } from "next";
import { appFetchSafe, getSessionUser } from "@/lib/appApi";
import type { LinkHistoryItem } from "@/lib/appTypes";
import { formatDateTime, formatPct, formatVnd } from "@/lib/format";
import LinkTool from "@/components/public/LinkTool";
import LinkHistoryRow from "@/components/account/LinkHistoryRow";
import { ArrowRightIcon, BoltIcon, CopyIcon, LinkIcon, WalletIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tạo link hoàn tiền Shopee | Rewally",
  description: "Dán link sản phẩm Shopee bất kỳ, nhận ngay link hoàn tiền kèm số tiền hoàn dự kiến.",
};

const STEPS = [
  {
    icon: CopyIcon,
    title: "Sao chép link sản phẩm",
    description: "Mở sản phẩm trên Shopee, bấm Chia sẻ rồi Sao chép liên kết.",
  },
  {
    icon: LinkIcon,
    title: "Dán vào Rewally",
    description: "Dán link ở ô phía trên, Rewally tạo link hoàn tiền gắn mã của bạn trong vài giây.",
  },
  {
    icon: WalletIcon,
    title: "Mua bằng link mới",
    description: "Mở link vừa tạo để đặt hàng. Tiền hoàn về ví sau khi đơn hoàn tất và đối soát.",
  },
];

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string {
  const value = params[key];
  const found = Array.isArray(value) ? value[0] : value;
  return found?.trim() ?? "";
}

export default async function LinkPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const initialUrl = one(params, "url");

  const user = await getSessionUser();
  const isAuthenticated = user != null;
  const history = isAuthenticated ? await appFetchSafe<LinkHistoryItem[]>("/links?limit=10", []) : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-extrabold text-[var(--accent-dark)]">
          <BoltIcon className="h-3.5 w-3.5" />
          Hoàn tiền cho mọi sản phẩm Shopee
        </span>
        <h1 className="mt-4 text-[26px] font-extrabold leading-tight text-[var(--foreground)] sm:text-4xl">
          Dán link Shopee, nhận link hoàn tiền
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--muted)] sm:text-[15px]">
          Sản phẩm bạn muốn mua không có trong danh sách? Chỉ cần dán link, Rewally tạo link hoàn tiền riêng và báo
          trước số tiền hoàn dự kiến.
        </p>
      </header>

      <section className="mt-7 rounded-[26px] bg-white p-4 shadow-[0_24px_60px_-40px_rgba(20,49,34,0.6)] ring-1 ring-[var(--border)] sm:p-6">
        <LinkTool isAuthenticated={isAuthenticated} initialUrl={initialUrl} variant="hero" autoSubmit={initialUrl !== ""} />
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, description }, index) => (
          <div key={title} className="rounded-2xl bg-white p-5 ring-1 ring-[var(--border)]">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-xs font-extrabold text-[var(--muted)]">Bước {index + 1}</span>
            </div>
            <h2 className="mt-3 text-sm font-extrabold text-[var(--foreground)]">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{description}</p>
          </div>
        ))}
      </section>

      {isAuthenticated && (
        <section className="mt-10 rounded-2xl bg-white p-5 ring-1 ring-[var(--border)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-extrabold text-[var(--foreground)]">Link gần đây</h2>
            <Link href="/account/links" className="inline-flex items-center gap-1 text-sm font-bold text-[var(--accent)] hover:underline">
              Xem tất cả
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Bạn chưa tạo link nào. Dán link sản phẩm Shopee ở trên để bắt đầu.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--border)]">
              {history.map((item) => (
                <LinkHistoryRow
                  key={item.id}
                  link={item.affiliateUrl}
                  source={item.shopeeUrl}
                  createdAt={formatDateTime(item.createdAt)}
                  estimate={
                    item.estimatedAmount != null
                      ? `${formatVnd(item.estimatedAmount)}${item.estimatedPct != null ? ` · ${formatPct(item.estimatedPct)}` : ""}`
                      : null
                  }
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="mt-8 text-center text-xs text-[var(--muted)]">
        Hiện hỗ trợ Shopee. Lazada, TikTok Shop và Tiki sẽ được mở trong các bản cập nhật tới.{" "}
        <Link href="/guide" className="font-bold text-[var(--accent)] hover:underline">
          Xem cách hoạt động
        </Link>
      </p>
    </div>
  );
}
