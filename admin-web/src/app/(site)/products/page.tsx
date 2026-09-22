import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { appFetchSafe, buildQuery, getSessionUser } from "@/lib/appApi";
import type { ShoppingCategory, ShoppingProduct } from "@/lib/appTypes";
import ProductCard from "@/components/public/ProductCard";
import ProductFilters from "@/components/public/ProductFilters";
import Pagination from "@/components/public/Pagination";
import { SearchIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mua sắm hoàn tiền | Rewally",
  description: "Duyệt sản phẩm Shopee kèm tỉ lệ hoàn tiền thực nhận, lọc theo giá, danh mục và số tiền hoàn.",
};

const PAGE_SIZE = 24;

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const found = Array.isArray(value) ? value[0] : value;
  return found && found.trim() ? found.trim() : undefined;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const page = Math.max(1, Number(one(params, "page")) || 1);
  const filters = {
    search: one(params, "search"),
    category: one(params, "category"),
    sort: one(params, "sort"),
    minPrice: one(params, "minPrice"),
    maxPrice: one(params, "maxPrice"),
    minCommissionPct: one(params, "minCommissionPct"),
    maxCommissionPct: one(params, "maxCommissionPct"),
    minCommissionAmount: one(params, "minCommissionAmount"),
    maxCommissionAmount: one(params, "maxCommissionAmount"),
    bestSeller: one(params, "bestSeller"),
    xtra: one(params, "xtra"),
  };

  const query = buildQuery({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const countQuery = buildQuery(filters);

  const [user, products, countResult, categories] = await Promise.all([
    getSessionUser(),
    appFetchSafe<ShoppingProduct[]>(`/shopping-products${query}`, []),
    appFetchSafe<{ total: number }>(`/shopping-products/count${countQuery}`, { total: 0 }),
    appFetchSafe<ShoppingCategory[]>("/shopping-categories?minCount=4", []),
  ]);

  const total = countResult.total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isAuthenticated = user != null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[22px] font-extrabold leading-tight text-[var(--foreground)] sm:text-2xl">
          {filters.search ? `Kết quả cho “${filters.search}”` : filters.category || "Mua sắm"}
        </h1>
        {total > 0 && <p className="text-sm text-[var(--muted)]">{total.toLocaleString("vi-VN")} sản phẩm</p>}
        <Link href="/link" className="ml-auto text-sm font-bold text-[var(--accent)] hover:underline">
          Không thấy sản phẩm cần mua? Dán link Shopee
        </Link>
      </header>

      <Suspense fallback={<div className="h-9 rounded-full bg-white ring-1 ring-[var(--border)]" />}>
        <ProductFilters categories={categories.map((c) => c.category)} />
      </Suspense>

      {products.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-[var(--border)] px-6 py-16 text-center">
          <SearchIcon className="h-8 w-8 text-[var(--muted)]" />
          <p className="mt-4 text-base font-extrabold text-[var(--foreground)]">Không tìm thấy sản phẩm phù hợp</p>
          <p className="mt-1.5 max-w-sm text-sm text-[var(--muted)]">
            Thử bỏ bớt bộ lọc, hoặc dán thẳng link sản phẩm Shopee để nhận link hoàn tiền.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              href="/link"
              className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-extrabold text-[var(--accent-foreground)]"
            >
              Dán link Shopee
            </Link>
            <Link
              href="/products"
              className="rounded-full bg-white px-6 py-2.5 text-sm font-extrabold text-[var(--foreground)] ring-1 ring-[var(--border)]"
            >
              Xem tất cả sản phẩm
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} isAuthenticated={isAuthenticated} />
            ))}
          </div>

          <Pagination
            basePath="/products"
            params={filters}
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
          />
        </>
      )}
    </div>
  );
}
