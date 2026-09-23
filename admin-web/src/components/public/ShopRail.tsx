"use client";

import { useRef } from "react";
import { Button } from "@heroui/react";
import { ShopRailCard } from "@/components/public/ShopCard";
import { ChevronLeftIcon, ChevronRightIcon, StoreIcon } from "@/components/icons";
import type { Shop } from "@/lib/appTypes";

// Same shape and scroll behaviour as ProductRail, with shop cards instead of
// product cards. Kept separate rather than generic: the two cards have
// different widths and different empty rules, and one component juggling both
// would be harder to read than the duplicated scroll handler.
export default function ShopRail({ shops, title = "Shop nổi bật", subtitle }: { shops: Shop[]; title?: string; subtitle?: string }) {
  const scroller = useRef<HTMLDivElement>(null);

  // There is deliberately no "see all shops" screen, so a rail with nothing in
  // it has no fallback to offer - it simply does not render.
  if (shops.length === 0) return null;

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
            <StoreIcon className="h-5 w-5 text-[var(--accent)]" />
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{subtitle}</p>}
        </div>

        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          <Button type="button" aria-label="Cuộn sang trái" onPress={() => scrollBy(-1)} variant="outline" size="sm" isIconOnly className="h-8 w-8 rounded-full">
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button type="button" aria-label="Cuộn sang phải" onPress={() => scrollBy(1)} variant="outline" size="sm" isIconOnly className="h-8 w-8 rounded-full">
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scroller}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {shops.map((shop) => (
          <ShopRailCard key={shop.id} shop={shop} className="w-[138px] shrink-0 snap-start sm:w-[150px]" />
        ))}
      </div>
    </section>
  );
}
