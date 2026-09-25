import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { appFetchSafe, buildQuery, getAppFeatures, getSessionUser } from "@/lib/appApi";
import type { Shop, ShoppingProduct } from "@/lib/appTypes";
import ProductCard from "@/components/public/ProductCard";
import Pagination from "@/components/public/Pagination";
import ShopVisitButton from "@/components/public/ShopVisitButton";
import { StarIcon, StoreIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

// Same page size and reasoning as /products: divisible by 2, 3, 4 and 5 so the
// last row is never one card short at any breakpoint.
const PAGE_SIZE = 60;

type Params = { shopId: string };
type SearchParams = Record<string, string | string[] | undefined>;

// Serves `visibleOnly`, so a shop that was deactivated or has lost its last
// product answers 404 rather than rendering an empty storefront.
async function loadShop(shopId: string) {
  return appFetchSafe<Shop | null>(`/shops/${encodeURIComponent(shopId)}`, null);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { shopId } = await params;
  const shop = await loadShop(shopId);
  if (!shop) return { title: "Không tìm thấy shop | Rewally" };
  return {
    title: `${shop.name} | Rewally`,
    description: `Mua sắm tại ${shop.name} qua Rewally và nhận hoàn tiền${
      shop.userCommissionRateText ? ` lên tới ${shop.userCommissionRateText}` : ""
    }.`,
  };
}

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { shopId } = await params;
  const query = await searchParams;
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const page = Math.max(1, Number(rawPage) || 1);

  // The shop screens are reached from the home rail and from search, both of
  // which the switch already hides - but the URL stays guessable and indexed,
  // so the page itself has to answer 404 while shops are switched off.
  const [features, shop] = await Promise.all([getAppFeatures(), loadShop(shopId)]);
  if (!features.shops || !shop) notFound();

  const listQuery = buildQuery({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const [user, products, countResult] = await Promise.all([
    getSessionUser(),
    appFetchSafe<ShoppingProduct[]>(`/shops/${encodeURIComponent(shopId)}/products${listQuery}`, []),
    appFetchSafe<{ total: number }>(`/shops/${encodeURIComponent(shopId)}/products/count`, { total: 0 }),
  ]);

  // The shop row's own counter is maintained by the crawler and can lag a page
  // of products by a few minutes; the live count is what the pager must use.
  const total = countResult.total || shop.productCount;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isAuthenticated = user != null;
  const hasCover = !!shop.coverUrl && /^https?:\/\//.test(shop.coverUrl);
  const avatar = [shop.imageUrl, shop.portraitUrl].find((url) => !!url && /^https?:\/\//.test(url)) ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-[var(--muted)]">
        <Link href="/" className="hover:text-[var(--accent)]">
          Trang chủ
        </Link>
        <span>/</span>
        <span className="truncate font-bold text-[var(--foreground)]">{shop.name}</span>
      </nav>

      <header className="overflow-hidden rounded-[26px] bg-white ring-1 ring-[var(--border)]">
        <div className="relative h-24 bg-[linear-gradient(135deg,var(--accent)_0%,#9BE0B6_100%)] sm:h-32">
          {hasCover && (
            <Image src={shop.coverUrl as string} alt="" fill sizes="100vw" className="object-cover" priority />
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4 p-4 sm:p-5">
          <span className="relative -mt-12 block h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-white ring-4 ring-white sm:-mt-14 sm:h-24 sm:w-24">
            {avatar ? (
              <Image src={avatar} alt={shop.name} fill sizes="96px" className="object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-[#f6f7f6]">
                <StoreIcon className="h-9 w-9 text-[var(--muted)]" />
              </span>
            )}
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold leading-tight text-[var(--foreground)] sm:text-2xl">{shop.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
              {shop.rating != null && shop.rating > 0 && (
                <span className="flex items-center gap-1">
                  <StarIcon className="h-4 w-4 text-[#f5a623]" />
                  <span className="font-extrabold text-[var(--foreground)]">{shop.rating.toFixed(1)}</span>
                  đánh giá
                </span>
              )}
              {shop.followersText && (
                <span>
                  <span className="font-extrabold text-[var(--foreground)]">{shop.followersText}</span> người theo dõi
                </span>
              )}
              <span>
                <span className="font-extrabold text-[var(--foreground)]">{total.toLocaleString("vi-VN")}</span> sản phẩm
              </span>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            {shop.userCommissionRateText && (
              <div className="rounded-2xl bg-[var(--accent-soft)] px-4 py-2.5 text-center ring-1 ring-[var(--accent)]/25">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--accent-dark)]">Hoàn tiền đến</p>
                <p className="text-xl font-extrabold leading-tight text-[var(--accent-dark)]">
                  {shop.userCommissionRateText}
                </p>
              </div>
            )}
            <ShopVisitButton shopId={shop.shopId} isAuthenticated={isAuthenticated} className="flex-1 sm:flex-none" />
          </div>
        </div>
      </header>

      {products.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-[var(--border)] px-6 py-16 text-center">
          <StoreIcon className="h-8 w-8 text-[var(--muted)]" />
          <p className="mt-4 text-base font-extrabold text-[var(--foreground)]">Shop này chưa có sản phẩm nào</p>
          <p className="mt-1.5 max-w-sm text-sm text-[var(--muted)]">
            Bạn vẫn có thể dán link sản phẩm bất kỳ của shop để nhận link hoàn tiền.
          </p>
          <Link
            href="/link"
            className="mt-5 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-extrabold text-[var(--accent-foreground)]"
          >
            Dán link Shopee
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} isAuthenticated={isAuthenticated} />
            ))}
          </div>

          <Pagination
            basePath={`/shop/${encodeURIComponent(shop.shopId)}`}
            params={{}}
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
          />
        </>
      )}
    </div>
  );
}
