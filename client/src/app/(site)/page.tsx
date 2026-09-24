import Image from "next/image";
import Link from "next/link";
import { Chip } from "@heroui/react";
import { appFetchSafe, buildQuery, getAppFeatures, getSessionUser } from "@/lib/appApi";
import type { Banner, Campaign, Shop, ShoppingCategory, ShoppingProduct } from "@/lib/appTypes";
import { PLAY_STORE_URL } from "@/lib/site";
import { displayName } from "@/lib/format";
import HeroSlider from "@/components/public/HeroSlider";
import ProductRail from "@/components/public/ProductRail";
import ShopRail from "@/components/public/ShopRail";
import CampaignCard from "@/components/public/CampaignCard";
import HowItWorks from "@/components/public/HowItWorks";
import MarketingHome from "@/components/public/MarketingHome";
import LinkTool from "@/components/public/LinkTool";
import { ArrowRightIcon, BoltIcon, FireIcon, GiftIcon, StarIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

const RAIL_LIMIT = 12;

export default async function HomePage() {
  const [user, features, categories, topCashback, bestSellers, xtra, recommended, shops, campaigns, count, banners] =
    await Promise.all([
      getSessionUser(),
      getAppFeatures(),
      appFetchSafe<ShoppingCategory[]>("/shopping-categories?minCount=4", []),
      appFetchSafe<ShoppingProduct[]>(
        `/shopping-products${buildQuery({ limit: RAIL_LIMIT, sort: "commission_desc" })}`,
        [],
      ),
      appFetchSafe<ShoppingProduct[]>(`/shopping-products${buildQuery({ limit: RAIL_LIMIT, bestSeller: 1 })}`, []),
      appFetchSafe<ShoppingProduct[]>(`/shopping-products${buildQuery({ limit: RAIL_LIMIT, xtra: 1 })}`, []),
      appFetchSafe<ShoppingProduct[]>(`/recommendations${buildQuery({ limit: RAIL_LIMIT })}`, []),
      // Hand-picked shops first, topped up by the backend with the highest
      // cashback shops that hold enough products to be worth opening. An empty
      // array only means there are no visible shops at all - the rail then
      // renders nothing rather than a gap.
      appFetchSafe<Shop[]>(`/shops/featured${buildQuery({ limit: RAIL_LIMIT })}`, []),
      appFetchSafe<Campaign[]>(`/campaigns${buildQuery({ limit: 4 })}`, []),
      appFetchSafe<{ total: number }>("/shopping-products/count", { total: 0 }),
      // The hero slides, editable at /admin/banners. An empty list only
      // means nobody has added any (or the backend is unreachable), and the
      // hero falls back to the slides bundled with the component.
      appFetchSafe<Banner[]>("/banners?platform=web", []),
    ]);

  const isAuthenticated = user != null;

  if (!isAuthenticated) {
    return (
      <MarketingHome
        banners={banners}
        categories={categories}
        productCount={count.total}
        topCashback={topCashback}
        bestSellers={bestSellers}
        xtra={xtra}
        shops={features.shops ? shops : []}
        campaigns={campaigns}
      />
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
      {/* The same hero the signed-out home shows, so logging in does not change
          the shape of the page. Its buttons switch to member destinations. */}
      <section className="pt-5 sm:pt-7">
        <HeroSlider banners={banners} isAuthenticated />
      </section>

      {/* The paste-a-link tool is the main revenue action, so it sits right under the banner. */}
      <section className="mt-5 rounded-[26px] bg-[var(--accent-soft)] p-4 ring-1 ring-[var(--accent)]/25 sm:p-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--foreground)] sm:text-xl">Dán link Shopee, nhận link hoàn tiền</h2>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              Mua bất kỳ sản phẩm nào trên Shopee và vẫn được hoàn tiền, không cần tìm trong danh sách.
            </p>
          </div>
          <Link href="/link" className="inline-flex items-center gap-1 text-sm font-extrabold text-[var(--accent-dark)] hover:underline">
            Xem hướng dẫn & link gần đây
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
        <LinkTool isAuthenticated variant="hero" />
      </section>

      {categories.length > 0 && (
        <section className="pt-5">
          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link href="/products">
              <Chip color="success" variant="primary" size="sm" className="text-white">
                Tất cả
              </Chip>
            </Link>
            {categories.slice(0, 14).map((c) => (
              <Link key={c.category} href={`/products?category=${encodeURIComponent(c.category)}`}>
                <Chip variant="soft" size="sm" className="bg-white text-[var(--foreground)]">
                  {c.category}
                </Chip>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-white px-5 py-4">
        <p className="text-sm text-[var(--muted)]">
          Chào mừng trở lại, <span className="font-extrabold text-[var(--foreground)]">{displayName(user)}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/account/wallet"
            className="rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-extrabold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white"
          >
            Ví hoàn tiền
          </Link>
          <Link
            href="/account/orders"
            className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-extrabold text-[var(--foreground)] transition hover:border-[var(--accent)]"
          >
            Đơn hàng của tôi
          </Link>
        </div>
      </section>

      <ProductRail
        title="Ưu đãi hoàn tiền tốt nhất"
        subtitle="Những sản phẩm đang có tỷ lệ hoàn nổi bật"
        href="/products?sort=commission_desc"
        products={topCashback}
        isAuthenticated={isAuthenticated}
        accent={<StarIcon className="h-4 w-4 text-[var(--accent)]" />}
      />

      <ShopRail shops={features.shops ? shops : []} subtitle="Cửa hàng đang có tỷ lệ hoàn tiền cao nhất trên Rewally" />

      <ProductRail
        title="Bán chạy nhất"
        subtitle="Sản phẩm được mua nhiều trên Shopee"
        href="/products?bestSeller=1"
        products={bestSellers}
        isAuthenticated={isAuthenticated}
        accent={<FireIcon className="h-4 w-4 text-[var(--danger)]" />}
      />

      <ProductRail
        title="Hoa hồng Xtra"
        subtitle="Shop tham gia chương trình hoa hồng mở rộng của Shopee"
        href="/products?xtra=1"
        products={xtra}
        isAuthenticated={isAuthenticated}
        accent={<BoltIcon className="h-4 w-4 text-[var(--warning)]" />}
      />

      <ProductRail
        title="Gợi ý cho bạn"
        subtitle="Dựa trên sản phẩm bạn đã xem và đã mua"
        href="/products"
        products={recommended}
        isAuthenticated={isAuthenticated}
      />

      {campaigns.length > 0 && (
        <section className="py-7">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-extrabold text-[var(--foreground)]">
                <GiftIcon className="h-4 w-4 text-[var(--accent)]" />
                Ưu đãi & Sự kiện
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Mua đủ mốc doanh số để nhận thêm thưởng</p>
            </div>
            <Link href="/campaigns" className="whitespace-nowrap text-sm font-extrabold text-[var(--accent)] hover:underline">
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

      <section className="mt-8 overflow-hidden rounded-[28px] bg-[#ffd8d1]">
        <div className="flex flex-col items-center gap-7 p-7 text-center sm:flex-row sm:p-9 sm:text-left">
          <Image
            src="/play-store-qr.png"
            alt="Mã QR tải ứng dụng Rewally"
            width={136}
            height={136}
            className="shrink-0 rounded-2xl border border-black/10 bg-white p-1"
          />
          <div>
            <h2 className="text-2xl font-extrabold text-[var(--foreground)]">Tải app Rewally</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
              Quét mã QR hoặc tải trên Google Play để theo dõi đơn hàng, ví hoàn tiền và tạo link ngay trên điện thoại.
            </p>
            <Link
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-extrabold text-white transition hover:opacity-90"
            >
              Tải trên Google Play
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
