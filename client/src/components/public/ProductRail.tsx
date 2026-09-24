"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { Button } from "@heroui/react";
import ProductCard from "@/components/public/ProductCard";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import type { ShoppingProduct } from "@/lib/appTypes";

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
  accent?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  function scrollBy(direction: -1 | 1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.82, 240), behavior: "smooth" });
  }

  return (
    <section className="py-7">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-[var(--foreground)]">
            {accent}
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{subtitle}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {href && (
            <Link href={href} className="whitespace-nowrap text-sm font-extrabold text-[var(--accent)] transition hover:underline">
              Xem tất cả
            </Link>
          )}
          <div className="hidden items-center gap-1 sm:flex">
            <Button type="button" aria-label="Cuộn sang trái" onPress={() => scrollBy(-1)} variant="outline" size="sm" isIconOnly className="h-8 w-8 rounded-full">
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button type="button" aria-label="Cuộn sang phải" onPress={() => scrollBy(1)} variant="outline" size="sm" isIconOnly className="h-8 w-8 rounded-full">
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
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
            className="w-[154px] shrink-0 snap-start sm:w-[178px] lg:w-[190px]"
          />
        ))}
      </div>
    </section>
  );
}
