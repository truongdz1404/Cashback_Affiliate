import type { Metadata } from "next";
import { appFetchSafe } from "@/lib/appApi";
import type { LinkHistoryItem } from "@/lib/appTypes";
import { formatDateTime, formatPct, formatVnd } from "@/lib/format";
import { SectionCard, EmptyState } from "@/components/account/ui";
import LinkCreator from "@/components/account/LinkCreator";
import LinkHistoryRow from "@/components/account/LinkHistoryRow";
import { LinkIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Tạo link | Rewally" };

export default async function LinksPage() {
  const history = await appFetchSafe<LinkHistoryItem[]>("/links?limit=100", []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-extrabold text-[var(--foreground)]">Tạo link hoàn tiền</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Dán link sản phẩm, nhận link hoàn tiền để mua hàng.
        </p>
      </div>

      <SectionCard>
        <LinkCreator />
      </SectionCard>

      <SectionCard title="Lịch sử tạo link" action={<span className="text-sm text-[var(--muted)]">{history.length} link</span>}>
        {history.length === 0 ? (
          <EmptyState
            icon={LinkIcon}
            title="Chưa có link nào"
            description="Dán link sản phẩm Shopee ở trên để tạo link hoàn tiền đầu tiên của bạn."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {history.map((item) => (
              <LinkHistoryRow
                key={item.id}
                link={item.affiliateUrl}
                source={item.shopeeUrl}
                createdAt={formatDateTime(item.createdAt)}
                estimate={
                  item.estimatedAmount != null
                    ? `${formatVnd(item.estimatedAmount)}${
                        item.estimatedPct != null ? ` · ${formatPct(item.estimatedPct)}` : ""
                      }`
                    : null
                }
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
