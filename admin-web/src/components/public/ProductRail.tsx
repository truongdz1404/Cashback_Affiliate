"use client";

import Link from "next/link";
import { useRef } from "react";
import ProductCard from "@/components/public/ProductCard";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import type { ShoppingProduct } from "@/lib/appTypes";

// A horizontally scrolling row of products, the shape every "Hoàn tiền tốt
// nhất" / "Bán chạy" / category strip on the homepage uses. Renders nothing
// when the backend has no rows for that filter yet, so an empty section never
// leaves a bare heading on the page.
export default function ProductRail({
  title,
  subtitle,
  href,
  products,
  isAuthenticated,
  accent,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  products: ShoppingProduct[];
  isAuthenticated: boolean;
  accent?: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  function scrollBy(direction: -1 | 1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.8, 240), behavior: "smooth" });
  }

  return (
    <section className="py-6">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[var(--foreground)] sm:text-xl">
            {accent}
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {href && (
            <Link
              href={href}
              className="whitespace-nowrap text-sm font-bold text-[var(--accent)] transition hover:underline"
            >
              Xem tất cả
            </Link>
          )}
          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              aria-label="Cuộn sang trái"
              onClick={() => scrollBy(-1)}
              className="rounded-full border border-[var(--border)] p-1.5 text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Cuộn sang phải"
              onClick={() => scrollBy(1)}
              className="rounded-full border border-[var(--border)] p-1.5 text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scroller}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isAuthenticated={isAuthenticated}
            className="w-[160px] shrink-0 snap-start sm:w-[190px] lg:w-[210px]"
          />
        ))}
      </div>
    </section>
  );
}
