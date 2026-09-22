import Image from "next/image";
import Link from "next/link";
import { appFetchSafe, buildQuery, getSessionUser } from "@/lib/appApi";
import type { Banner, Campaign, ShoppingCategory, ShoppingProduct } from "@/lib/appTypes";
import { PLAY_STORE_URL } from "@/lib/site";
import { displayName } from "@/lib/format";
import BannerCarousel from "@/components/public/BannerCarousel";
import ProductRail from "@/components/public/ProductRail";
import CampaignCard from "@/components/public/CampaignCard";
import HowItWorks from "@/components/public/HowItWorks";
import MarketingHome from "@/components/public/MarketingHome";
import { BoltIcon, FireIcon, GiftIcon, StarIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

const RAIL_LIMIT = 12;

// Shown only when the operator has not uploaded any banner yet. These two are
// the marketing banners shipped with the mobile app, so the fallback is real
// Rewally artwork rather than a grey placeholder.
const FALLBACK_BANNERS: Banner[] = [
  { id: -1, imageUrl: "/banner-1.png", linkUrl: "/products", sortOrder: 0 },
  { id: -2, imageUrl: "/banner-4.png", linkUrl: "/register", sortOrder: 1 },
];

export default async function HomePage() {
  const [user, banners, categories, topCashback, bestSellers, xtra, recommended, campaigns, count] = await Promise.all([
    getSessionUser(),
    appFetchSafe<Banner[]>("/banners", []),
    appFetchSafe<ShoppingCategory[]>("/shopping-categories?minCount=4", []),
    appFetchSafe<ShoppingProduct[]>(`/shopping-products${buildQuery({ limit: RAIL_LIMIT, sort: "commission_desc" })}`, []),
    appFetchSafe<ShoppingProduct[]>(`/shopping-products${buildQuery({ limit: RAIL_LIMIT, bestSeller: 1 })}`, []),
    appFetchSafe<ShoppingProduct[]>(`/shopping-products${buildQuery({ limit: RAIL_LIMIT, xtra: 1 })}`, []),
    appFetchSafe<ShoppingProduct[]>(`/recommendations${buildQuery({ limit: RAIL_LIMIT })}`, []),
    appFetchSafe<Campaign[]>(`/campaigns${buildQuery({ limit: 4 })}`, []),
    appFetchSafe<{ total: number }>("/shopping-products/count", { total: 0 }),
  ]);

  const isAuthenticated = user != null;
  const slides = banners.length > 0 ? banners : FALLBACK_BANNERS;

  // A visitor who is not signed in gets the marketing page: what Rewally is,
  // how the money reaches them, and one clear way to start. The product-first
  // home below only makes sense once they have an account and a wallet.
  if (!isAuthenticated) {
    return (
      <MarketingHome
        categories={categories}
        productCount={count.total}
        topCashback={topCashback}
        bestSellers={bestSellers}
        xtra={xtra}
        campaigns={campaigns}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <section className="pt-5">
        <BannerCarousel banners={slides} />
      </section>

      {categories.length > 0 && (
        <section className="pt-6">
          <div className="flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link
              href="/products"
              className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent-foreground)]"
            >
              Tất cả
            </Link>
            {categories.slice(0, 14).map((c) => (
              <Link
                key={c.category}
                href={`/products?category=${encodeURIComponent(c.category)}`}
                className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {c.category}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <p className="text-sm text-[var(--muted)]">
          Chào mừng trở lại,{" "}
          <span className="font-extrabold text-[var(--foreground)]">{displayName(user)}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/account/wallet"
            className="rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-bold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
          >
            Ví hoàn tiền
          </Link>
          <Link
            href="/account/orders"
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--foreground)] transition hover:border-[var(--accent)]"
          >
            Đơn hàng của tôi
          </Link>
        </div>
      </section>

      <ProductRail
        title="Ưu đãi hoàn tiền tốt nhất"
        subtitle="Những sản phẩm đang trả tỉ lệ hoàn cao nhất hiện nay"
        href="/products?sort=commission_desc"
        products={topCashback}
        isAuthenticated={isAuthenticated}
        accent={<StarIcon className="h-5 w-5 text-[var(--accent)]" />}
      />

      <ProductRail
        title="Bán chạy nhất"
        subtitle="Sản phẩm được mua nhiều trên Shopee"
        href="/products?bestSeller=1"
        products={bestSellers}
        isAuthenticated={isAuthenticated}
        accent={<FireIcon className="h-5 w-5 text-[var(--danger)]" />}
      />

      <ProductRail
        title="Hoa hồng Xtra"
        subtitle="Shop tham gia chương trình hoa hồng mở rộng của Shopee"
        href="/products?xtra=1"
        products={xtra}
        isAuthenticated={isAuthenticated}
        accent={<BoltIcon className="h-5 w-5 text-[var(--warning)]" />}
      />

      <ProductRail
        title="Gợi ý cho bạn"
        subtitle="Dựa trên sản phẩm bạn đã xem và đã mua"
        href="/products"
        products={recommended}
        isAuthenticated={isAuthenticated}
      />

      {campaigns.length > 0 && (
        <section className="py-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-[var(--foreground)] sm:text-xl">
                <GiftIcon className="h-5 w-5 text-[var(--accent)]" />
                Ưu đãi & Sự kiện
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Mua đủ mốc doanh số để nhận thêm thưởng</p>
            </div>
            <Link href="/campaigns" className="whitespace-nowrap text-sm font-bold text-[var(--accent)] hover:underline">
              Xem tất cả
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {campaigns.slice(0, 4).map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} isAuthenticated={isAuthenticated} />
            ))}
          </div>
        </section>
      )}

      <HowItWorks />

      <section className="mt-8 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-col items-center gap-7 p-7 sm:flex-row sm:p-10">
          <Image
            src="/play-store-qr.png"
            alt="Mã QR tải ứng dụng Rewally"
            width={168}
            height={168}
            className="shrink-0 rounded-2xl border border-[var(--border)]"
          />
          <div className="text-center sm:text-left">
            <h2 className="text-xl font-extrabold text-[var(--foreground)] sm:text-2xl">Tải app Rewally</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">
              Quét mã QR hoặc tải trên Google Play để theo dõi đơn hàng, ví hoàn tiền và tạo link ngay trên điện thoại.
            </p>
            <Link
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex rounded-full bg-[var(--accent)] px-7 py-3 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105"
            >
              Tải trên Google Play
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
