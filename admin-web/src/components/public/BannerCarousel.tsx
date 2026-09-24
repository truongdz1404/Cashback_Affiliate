"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import type { Banner } from "@/lib/appTypes";

const AUTOPLAY_MS = 5000;

// Banners uploaded through /admin/banners carry an arbitrary absolute URL the
// operator typed in, so next/image (which needs every host allow-listed in
// next.config.mjs) is not usable here - a plain <img> is, and it degrades to
// the alt text instead of throwing when a host is unreachable.
export default function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);

  const count = banners.length;
  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [count, paused]);

  if (count === 0) return null;

  return (
    <div
      className="relative overflow-hidden rounded-3xl bg-[var(--surface-secondary)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStart.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStart.current == null) return;
        const delta = e.changedTouches[0].clientX - touchStart.current;
        if (Math.abs(delta) > 40) go(index + (delta < 0 ? 1 : -1));
        touchStart.current = null;
      }}
    >
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {banners.map((banner, i) => {
          const isExternal = banner.linkUrl != null && /^https?:\/\//i.test(banner.linkUrl);
          const image = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={banner.imageUrl}
              alt={`Ưu đãi Rewally ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              className="aspect-[2.4/1] w-full object-cover"
            />
          );
          return (
            <div key={banner.id} className="w-full shrink-0">
              {banner.linkUrl ? (
                <a href={banner.linkUrl} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined} className="block">
                  {image}
                </a>
              ) : (
                image
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Banner trước"
            onClick={() => go(index - 1)}
            className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/85 p-2 text-[var(--foreground)] shadow transition hover:bg-white sm:block"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Banner kế tiếp"
            onClick={() => go(index + 1)}
            className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/85 p-2 text-[var(--foreground)] shadow transition hover:bg-white sm:block"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
            {banners.map((banner, i) => (
              <button
                key={banner.id}
                type="button"
                aria-label={`Tới banner ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-6 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
