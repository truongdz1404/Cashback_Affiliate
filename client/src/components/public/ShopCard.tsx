import Image from "next/image";
import Link from "next/link";
import type { EmbeddedShop, Shop } from "@/lib/appTypes";
import { StarIcon, StoreIcon } from "@/components/icons";

// Shopee serves shop avatars from its own CDN. Anything it hands back may be a
// relative file id rather than a URL, so a shop with no usable image falls back
// to the storefront glyph instead of rendering a broken <Image>.
function isUsableImage(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//.test(url);
}

export function shopHref(shopId: string) {
  return `/shop/${encodeURIComponent(shopId)}`;
}

function ShopAvatar({ shop, size }: { shop: Shop | EmbeddedShop; size: number }) {
  const src = isUsableImage(shop.imageUrl) ? shop.imageUrl : isUsableImage(shop.portraitUrl) ? shop.portraitUrl : null;
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-full bg-[#f6f7f6] ring-1 ring-[var(--border)]"
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt={shop.name} fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <StoreIcon className="h-1/2 w-1/2 text-[var(--muted)]" />
        </span>
      )}
    </span>
  );
}

// The rail card on the home page. Fixed width so the row scrolls in even
// steps; the name is clamped to two lines because Shopee shop names run long
// ("… Official Store") and a third line would push the stats out of the card.
export function ShopRailCard({ shop, className = "" }: { shop: Shop; className?: string }) {
  return (
    <Link
      href={shopHref(shop.shopId)}
      className={`group flex flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center ring-1 ring-[var(--border)] transition duration-200 hover:ring-[var(--accent)] hover:shadow-[0_14px_32px_-24px_rgba(20,49,34,0.45)] ${className}`}
    >
      <ShopAvatar shop={shop} size={64} />
      <span className="line-clamp-2 text-[13px] font-extrabold leading-4 text-[var(--foreground)]">{shop.name}</span>
      {shop.userCommissionRateText && (
        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--accent-dark)]">
          Hoàn đến {shop.userCommissionRateText}
        </span>
      )}
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
        {shop.rating != null && shop.rating > 0 && (
          <span className="flex items-center gap-0.5">
            <StarIcon className="h-3 w-3 text-[#f5a623]" />
            {shop.rating.toFixed(1)}
          </span>
        )}
        <span>{shop.productCount.toLocaleString("vi-VN")} sản phẩm</span>
      </span>
    </Link>
  );
}

// The wide card above search results, when what someone typed names a shop
// rather than a product. Deliberately one row and visually quieter than the
// product grid below it - it is a shortcut, not the answer.
export function ShopSearchCard({ shop }: { shop: Shop }) {
  return (
    <Link
      href={shopHref(shop.shopId)}
      className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-[var(--border)] transition hover:ring-[var(--accent)] sm:gap-4 sm:p-4"
    >
      <ShopAvatar shop={shop} size={56} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[15px] font-extrabold text-[var(--foreground)]">{shop.name}</span>
          {shop.userCommissionRateText && (
            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--accent-dark)]">
              Hoàn đến {shop.userCommissionRateText}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-[var(--muted)]">
          {shop.rating != null && shop.rating > 0 && (
            <span className="flex items-center gap-0.5">
              <StarIcon className="h-3 w-3 text-[#f5a623]" />
              {shop.rating.toFixed(1)}
            </span>
          )}
          {shop.followersText && <span>{shop.followersText} người theo dõi</span>}
          <span>{shop.productCount.toLocaleString("vi-VN")} sản phẩm</span>
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-3.5 py-1.5 text-xs font-extrabold text-[var(--accent-dark)]">
        Xem shop
      </span>
    </Link>
  );
}
