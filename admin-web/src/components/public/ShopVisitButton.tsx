"use client";

import { useOpenShopOnShopee } from "@/components/public/useOpenShopOnShopee";
import { ExternalLinkIcon, StoreIcon } from "@/components/icons";

// "Vào shop trên Shopee" on the shop page. We only hold the slice of the
// catalogue our crawler has taken, so the storefront itself is where the rest
// of it lives - and a visitor who cannot get there from here simply opens
// Shopee in another tab, on a link that pays nobody.
//
// The link is minted per visitor with a sub id, the same way a product tap is,
// so the cashback path stays intact; playwright-service/lib/shopLink.js records
// what is and is not proven about attribution at shop level.
export default function ShopVisitButton({
  shopId,
  isAuthenticated,
  className = "",
}: {
  shopId: string;
  isAuthenticated: boolean;
  className?: string;
}) {
  const { openShop, loading } = useOpenShopOnShopee();

  return (
    <button
      type="button"
      onClick={() => openShop(shopId, isAuthenticated)}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-95 disabled:opacity-70 ${className}`}
    >
      <StoreIcon className="h-4 w-4" />
      {loading ? "Đang mở cửa hàng…" : "Vào shop trên Shopee"}
      <ExternalLinkIcon className="h-3.5 w-3.5 opacity-80" />
    </button>
  );
}
