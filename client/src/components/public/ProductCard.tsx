"use client";

import Image from "next/image";
import { useState } from "react";
import { toast } from "@heroui/react";
import { appClient, AppRequestError } from "@/lib/appClient";
import { openAuthDialog } from "@/lib/authDialog";
import { openPendingTab } from "@/lib/pendingTab";
import { formatPct, formatVnd } from "@/lib/format";
import type { ShoppingProduct, ShoppingProductOpenResult } from "@/lib/appTypes";
import { useOpenShopOnShopee } from "@/components/public/useOpenShopOnShopee";
import { ArrowRightIcon, ExternalLinkIcon, ImageIcon, StoreIcon } from "@/components/icons";

// One card = two taps, and only two. The card body opens the product's own
// cashback link; the storefront strip along the bottom opens the shop on
// Shopee. They are separate elements rather than one button with a nested
// button inside it, which is invalid HTML and behaves unpredictably.
//
// A guest goes through the same round trip as anyone else. The backend
// answers with the operator's affiliate link marked as a guest tap, so the
// commission survives a logged-out order - a plain shopee.vn URL would have
// paid nobody at all. The sign-in dialog then opens on this tab to say that
// the cashback half is the part that needs an account, without blocking the
// jump, which has already happened.
export default function ProductCard({
  product,
  isAuthenticated,
  className = "",
}: {
  product: ShoppingProduct;
  isAuthenticated: boolean;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const { openShop, loading: openingShop } = useOpenShopOnShopee();

  const pct = product.userCommissionRateValue;
  const amount = product.userCommissionValue;
  const hasPct = pct != null && pct > 0;
  const hasAmount = amount != null && amount > 0;
  const tags = [product.isBestSeller && "Bán chạy", product.isXtraCommission && "Xtra"].filter(Boolean) as string[];

  // Only products the shop-name resolver has mapped onto a real shop can be
  // linked out; the rest keep the bare shop name as text, since there is
  // nowhere to send anyone.
  const shopId = product.shop?.shopId || product.shopId;
  const shopName = product.shop?.name || product.shopName;

  async function open() {
    if (loading) return;

    // Minting a cashback link takes a few seconds (a real browser on the server
    // has to ask Shopee for it), so the tab is opened first - inside the click
    // handler, or the popup blocker eats it - and pointed at the URL after.
    const tab = openPendingTab();
    setLoading(true);
    try {
      const result = await appClient.post<ShoppingProductOpenResult>(`/shopping-products/${product.id}/open`);
      if (tab) tab.location.href = result.affiliateUrl;
      else window.location.href = result.affiliateUrl;

      if (!isAuthenticated) {
        openAuthDialog({
          title: "Đăng nhập để đơn này được hoàn tiền",
          description:
            "Shopee đã mở ở tab mới. Đơn mua lúc chưa đăng nhập sẽ không được hoàn tiền - đăng nhập rồi bấm lại sản phẩm để mua qua link hoàn tiền của bạn.",
        });
      }
    } catch (err) {
      if (tab) tab.close();
      const message = err instanceof AppRequestError ? err.message : "Không mở được liên kết hoàn tiền.";
      if (!(err instanceof AppRequestError) || err.status !== 401) toast.danger(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-[var(--border)] transition duration-200 hover:ring-[var(--accent)] hover:shadow-[0_14px_32px_-24px_rgba(20,49,34,0.45)] ${className}`}
    >
      <button
        type="button"
        onClick={open}
        disabled={loading}
        aria-label={`Mua ${product.name} và nhận hoàn tiền`}
        className="flex flex-1 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span className="relative block aspect-square w-full overflow-hidden bg-[#f6f7f6]">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
              className="object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[var(--muted)]">
              <ImageIcon className="h-8 w-8" />
            </span>
          )}

          {hasPct && (
            <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-extrabold text-[var(--accent)] shadow-sm backdrop-blur">
              Hoàn {formatPct(pct)}
            </span>
          )}

          {loading && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-bold text-white">
              Đang mở Shopee…
            </span>
          )}
        </span>

        <span className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
          {/* The shop name only appears here when there is no storefront to
              link to - otherwise it lives in the strip below, where it can be
              tapped. Repeating it in both places would just be noise. */}
          {((shopName && !shopId) || tags.length > 0) && (
            <span className="mb-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-[var(--muted)]">
              {shopName && !shopId && <span className="truncate">{shopName}</span>}
              {tags.map((tag) => (
                <span
                  key={tag}
                  className={`shrink-0 rounded px-1 py-px text-[10px] font-bold ${
                    tag === "Xtra" ? "bg-[#fff4d6] text-[#a36b00]" : "bg-[#ffe9e6] text-[#c4342f]"
                  }`}
                >
                  {tag}
                </span>
              ))}
            </span>
          )}

          <span className="line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-5 text-[var(--foreground)]">
            {product.name}
          </span>

          <span className="mt-auto flex items-end justify-between gap-2 pt-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-extrabold leading-5 text-[var(--foreground)]">
                {product.priceValue != null ? formatVnd(product.priceValue) : product.priceText || "Xem giá"}
              </span>
              <span className="block truncate text-xs font-bold leading-4 text-[var(--accent)]">
                {hasAmount ? `Hoàn ${formatVnd(amount)}` : hasPct ? `Hoàn ${formatPct(pct)}` : "Có hoàn tiền"}
              </span>
            </span>
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] transition group-hover:bg-[var(--accent)] group-hover:text-white"
            >
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </span>
          </span>
        </span>
      </button>

      {/* Straight out to the shop's Shopee storefront, not to our own shop
          page: someone who wants the whole catalogue should not have to come
          back out through a second tap, and every tap that stops short of
          Shopee is commission we never earn. Our shop page is still reachable
          from the home rail and from search. */}
      {shopId && shopName && (
        <button
          type="button"
          onClick={() => openShop(shopId, isAuthenticated)}
          disabled={openingShop}
          aria-label={`Xem cửa hàng ${shopName} trên Shopee`}
          className="flex w-full min-w-0 items-center gap-1.5 border-t border-[var(--border)] px-3 py-2 text-left text-[11px] font-bold leading-4 text-[var(--muted)] outline-none transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60"
        >
          <StoreIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{openingShop ? "Đang mở cửa hàng…" : shopName}</span>
          <ExternalLinkIcon className="ml-auto h-3 w-3 shrink-0 opacity-70" />
        </button>
      )}
    </article>
  );
}
