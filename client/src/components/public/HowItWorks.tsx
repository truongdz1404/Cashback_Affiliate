"use client";

import Image from "next/image";
import { useState } from "react";

// Illustrations are 880x700 (the 440/350 frame the reference layout uses).
// TODO: these are temporary reference images; replace with Rewally-owned
// artwork before the public launch.
const STEPS = [
  {
    title: "Tìm kiếm sản phẩm hoặc cửa hàng yêu thích",
    description: "Tìm deal, ngành hàng hoặc sản phẩm đang có hoàn tiền trên Rewally.",
    image: "/marketing/how-it-works-step1.png",
    alt: "Minh họa thanh tìm kiếm cửa hàng yêu thích",
  },
  {
    title: "Mua sắm trên Shopee như mọi khi",
    description: "Bấm qua Rewally rồi mua hàng như bình thường để đơn được ghi nhận.",
    image: "/marketing/how-it-works-step2.png",
    alt: "Minh họa các thẻ hoàn tiền và nút đặt ngay",
  },
  {
    title: "Hãy yên tâm tận hưởng trong khi Rewally ghi nhận hoàn tiền",
    description: "Tiền hoàn được cộng vào ví sau khi đơn hoàn tất và đối soát.",
    image: "/marketing/how-it-works-step3.png",
    alt: "Minh họa số dư có thể rút và nút rút tiền",
  },
];

export default function HowItWorks({ className = "" }: { className?: string }) {
  const [active, setActive] = useState(0);
  const current = STEPS[active];

  return (
    <section className={`py-10 sm:py-14 lg:py-16 ${className}`}>
      {/* On phones the heading comes first and the illustration follows it;
          side by side, the illustration goes back to the left column. */}
      <div className="grid items-center gap-6 lg:min-h-[430px] lg:grid-cols-[0.98fr_1fr] lg:gap-16">
        <div className="relative order-2 mx-auto aspect-[440/350] w-full max-w-[320px] sm:max-w-[440px] lg:order-none">
          <Image
            key={current.image}
            src={current.image}
            alt={current.alt}
            fill
            sizes="(max-width: 1024px) 100vw, 440px"
            className="object-contain transition-opacity duration-500"
            priority={active === 0}
          />
        </div>

        <div className="order-1 lg:order-none lg:pl-4">
          <h2 className="text-2xl font-extrabold leading-tight text-[var(--foreground)] sm:text-3xl">Cách hoạt động</h2>

          <div className="mt-5 sm:mt-7">
            {STEPS.map((step, index) => {
              const isActive = active === index;

              return (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => setActive(index)}
                  aria-current={isActive ? "step" : undefined}
                  className="group grid w-full grid-cols-[2.75rem_1fr] gap-4 text-left"
                >
                  <span className="flex flex-col items-center">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold transition ${
                        isActive ? "bg-black text-white" : "bg-[#f1f3f5] text-[#8c95a1] group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]"
                      }`}
                    >
                      {index + 1}
                    </span>
                    {index < STEPS.length - 1 && <span className="h-12 w-px bg-[#dde2e7]" />}
                  </span>

                  <span className="pb-8 pt-2">
                    <span
                      className={`block text-sm font-extrabold transition sm:text-base ${
                        isActive ? "text-[var(--foreground)]" : "text-[#a9b0bc] group-hover:text-[var(--foreground)]"
                      }`}
                    >
                      {step.title}
                    </span>
                    <span className={`mt-1 block max-w-md text-sm leading-6 ${isActive ? "text-[var(--muted)]" : "sr-only"}`}>
                      {step.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
