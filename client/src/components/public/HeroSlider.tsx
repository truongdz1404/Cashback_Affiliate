"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { PLAY_STORE_URL } from "@/lib/site";

const AUTOPLAY_MS = 6000;

type Cta = { label: string; href: string; external?: boolean };

type Slide = {
  id: string;
  image: string;
  alt: string;
  /** Sampled from the artwork's own left edge, so the stacked phone layout has
   *  no seam where the image ends and the text block begins. */
  surface: string;
  /** Slide 6 keeps its QR code in the lower-left of the artwork, so its text
   *  has to sit above it rather than in the middle. */
  align?: "top";
  eyebrow: string;
  title: string;
  body: string;
  primary: Cta;
  secondary?: Cta;
  /** Used instead of `primary`/`secondary` for a signed-in member: the guest
   *  copy invites them to register, which they have already done. A slide that
   *  omits these keeps the same buttons for everyone. */
  memberPrimary?: Cta;
  memberSecondary?: Cta;
};

// The artwork in public/rewally-banner is drawn with an empty left column on
// purpose: the headline, the body copy and the buttons are real HTML on top of
// it. That keeps the type crisp at every width, keeps the links crawlable, and
// means the copy can change without redrawing a 1944px image.
const SLIDES: Slide[] = [
  {
    id: "cashback",
    image: "/rewally-banner/01-hoan-tien-moi-don.png",
    alt: "Ứng dụng Rewally hiển thị số dư hoàn tiền và một sản phẩm đang hoàn 8%",
    surface: "#F7FEFB",
    eyebrow: "Miễn phí tham gia",
    title: "Cứ mua sắm là được hoàn tiền",
    body: "Mua hàng Shopee như bình thường, chỉ cần đi qua Rewally. Hoàn tiền được ghi nhận theo từng đơn và rút về ngân hàng khi đủ điều kiện.",
    primary: { label: "Tham gia nhận hoàn tiền", href: "/register" },
    secondary: { label: "Xem sản phẩm", href: "/products" },
    memberPrimary: { label: "Săn deal hoàn tiền", href: "/products" },
    memberSecondary: { label: "Ví hoàn tiền của tôi", href: "/account/wallet" },
  },
  {
    id: "deals",
    image: "/rewally-banner/02-deal-hoan-tien-cao.png",
    alt: "Hai thẻ sản phẩm với tỷ lệ hoàn tiền nổi bật và nút hoàn tiền",
    surface: "#FBFEFD",
    eyebrow: "Deal hoàn tiền cao",
    title: "Săn sản phẩm có tỷ lệ hoàn cao nhất",
    body: "Danh sách hoàn tiền cao được cập nhật liên tục và xếp sẵn theo từng danh mục bạn hay mua.",
    primary: { label: "Săn deal hoàn cao", href: "/products" },
    secondary: { label: "Chiến dịch đang chạy", href: "/campaigns" },
  },
  {
    id: "wallet",
    image: "/rewally-banner/03-vi-hoan-tien.png",
    alt: "Thẻ ví hoàn tiền Rewally với nút rút tiền, tiền mặt và đồng xu",
    surface: "#FDFEFD",
    eyebrow: "Ví hoàn tiền",
    title: "Tiền về ví, rút thẳng về ngân hàng",
    body: "Theo dõi từng đơn, biết rõ khi nào khoản hoàn được duyệt và rút về tài khoản của bạn.",
    primary: { label: "Tạo tài khoản", href: "/register" },
    secondary: { label: "Cách hoạt động", href: "/guide" },
    memberPrimary: { label: "Mở ví hoàn tiền", href: "/account/wallet" },
  },
  {
    id: "link",
    image: "/rewally-banner/04-tao-link-nhanh.png",
    alt: "Ô dán link sản phẩm Shopee và nút tạo link của Rewally",
    surface: "#FEFEFE",
    eyebrow: "Tạo link trong vài giây",
    title: "Dán link sản phẩm, nhận hoàn tiền",
    body: "Copy link từ Shopee rồi dán vào Rewally và mua như bình thường. Không cần cài thêm tiện ích nào.",
    primary: { label: "Dán link ngay", href: "/link" },
    secondary: { label: "Hướng dẫn", href: "/guide" },
  },
  {
    id: "referral",
    image: "/rewally-banner/05-gioi-thieu-ban-be.png",
    alt: "Hai người dùng được kết nối với nhau, hộp quà và ô mã giới thiệu",
    surface: "#FBFEFD",
    eyebrow: "Giới thiệu bạn bè",
    title: "Rủ bạn cùng mua, cùng nhận thưởng",
    body: "Mỗi người bạn giới thiệu thành công đều mang thêm hoàn tiền về cho bạn.",
    primary: { label: "Nhận mã giới thiệu", href: "/register" },
    secondary: { label: "Tìm hiểu thêm", href: "/guide" },
    memberPrimary: { label: "Lấy mã giới thiệu", href: "/account/referral" },
  },
  {
    id: "app",
    image: "/rewally-banner/06-tai-app-qr-chuan.png",
    alt: "Ứng dụng Rewally trên điện thoại kèm mã QR để tải app",
    surface: "#FDEAE7",
    align: "top",
    eyebrow: "Ứng dụng Rewally",
    title: "Săn deal, nhận hoàn tiền ngay trên điện thoại",
    body: "Theo dõi đơn, rút tiền và nhận thông báo deal mới mọi lúc.",
    primary: { label: "Tải ứng dụng", href: PLAY_STORE_URL, external: true },
  },
];

function CtaLink({ cta, tone }: { cta: Cta; tone: "primary" | "secondary" }) {
  const className =
    tone === "primary"
      ? "inline-flex h-11 items-center gap-2 rounded-full bg-[var(--accent-dark)] px-5 text-sm font-extrabold text-white shadow-[0_16px_34px_-20px_rgba(20,49,34,0.9)] transition hover:brightness-110"
      : "inline-flex h-11 items-center rounded-full bg-white/85 px-5 text-sm font-bold text-[var(--foreground)] ring-1 ring-[var(--border)] backdrop-blur transition hover:bg-white";
  const content = (
    <>
      {cta.label}
      {tone === "primary" && <ArrowRightIcon className="h-4 w-4" />}
    </>
  );

  // next/link would try to prefetch the Play Store as a route, so an off-site
  // destination stays a plain anchor.
  return cta.external ? (
    <a href={cta.href} target="_blank" rel="noopener noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <Link href={cta.href} className={className}>
      {content}
    </Link>
  );
}

// The same hero runs on both home pages - signed out and signed in - so the
// site does not change shape the moment someone logs in. Only the buttons
// differ: `isAuthenticated` swaps the sign-up calls to action for member ones.
export default function HeroSlider({
  isAuthenticated = false,
  tuckedCard = false,
}: {
  isAuthenticated?: boolean;
  /** True when the page slides a card up over the banner's bottom edge (the
   *  stats strip on the signed-out home). The dots and the mobile copy then
   *  keep clear of it; on a page with nothing underneath they sit lower. */
  tuckedCard?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);

  const count = SLIDES.length;
  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [count, paused]);

  return (
    <div
      className="relative overflow-hidden rounded-[28px] shadow-[0_28px_70px_-44px_rgba(20,49,34,0.75)] ring-1 ring-[var(--border)]"
      style={{ backgroundColor: SLIDES[index].surface, transition: "background-color 500ms ease-out" }}
      aria-roledescription="carousel"
      aria-label="Ưu đãi Rewally"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // Autoplay has to stop while someone is tabbing through a slide's buttons,
      // otherwise the control they are on slides out from under them.
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
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
        {SLIDES.map((slide, i) => {
          const Title = i === 0 ? "h1" : "h2";
          const primary = (isAuthenticated && slide.memberPrimary) || slide.primary;
          const secondary = (isAuthenticated && slide.memberSecondary) || slide.secondary;
          return (
            <div
              key={slide.id}
              className="w-full shrink-0"
              style={{ backgroundColor: slide.surface }}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${count}`}
              inert={i !== index}
            >
              {/* Phones stack the artwork above the copy; from lg the copy moves
                  into the empty left column the artwork was drawn around. */}
              <div className="relative lg:aspect-[2.4/1]">
                <div className="relative aspect-3/2 w-full sm:aspect-2/1 lg:absolute lg:inset-0 lg:aspect-auto lg:h-full">
                  <Image
                    src={slide.image}
                    alt={slide.alt}
                    fill
                    priority={i === 0}
                    sizes="(max-width: 1152px) 100vw, 1152px"
                    className="object-cover object-[72%_center] sm:object-[66%_center] lg:object-center"
                  />
                </div>

                <div
                  className={`relative px-5 pt-6 sm:px-8 lg:absolute lg:inset-y-0 lg:left-0 lg:flex lg:w-[43%] lg:flex-col lg:px-0 lg:pb-0 lg:pl-[5%] lg:pr-4 ${
                    tuckedCard ? "pb-24" : "pb-14"
                  } ${
                    slide.align === "top" ? "lg:justify-start lg:pt-[7%]" : "lg:justify-center lg:pt-0"
                  }`}
                >
                  <span className="inline-flex w-fit items-center rounded-full bg-white/85 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[var(--accent-dark)] ring-1 ring-black/5 backdrop-blur">
                    {slide.eyebrow}
                  </span>
                  <Title className="mt-3 text-[1.55rem] font-extrabold leading-[1.1] text-[var(--foreground)] sm:text-[2rem] lg:mt-4 lg:text-[1.85rem] xl:text-[2.3rem]">
                    {slide.title}
                  </Title>
                  <p className="mt-2.5 max-w-md text-sm font-medium leading-6 text-[var(--foreground)]/72 lg:mt-3 lg:text-[15px]">
                    {slide.body}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3 lg:mt-6">
                    <CtaLink cta={primary} tone="primary" />
                    {secondary && <CtaLink cta={secondary} tone="secondary" />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="Ưu đãi trước"
        onClick={() => go(index - 1)}
        className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/80 p-2 text-[var(--foreground)] shadow ring-1 ring-black/5 backdrop-blur transition hover:bg-white lg:block"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Ưu đãi kế tiếp"
        onClick={() => go(index + 1)}
        className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/80 p-2 text-[var(--foreground)] shadow ring-1 ring-black/5 backdrop-blur transition hover:bg-white lg:block"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>

      {/* The artwork is pale, so white dots would vanish - they sit on a frosted
          pill and are drawn in the brand green instead. They lift clear of the
          bottom edge only where a card tucks under the banner. */}
      <div
        className={`absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1.5 ring-1 ring-black/5 backdrop-blur lg:left-[5%] lg:translate-x-0 ${
          tuckedCard ? "bottom-14" : "bottom-4"
        }`}
      >
        {SLIDES.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Tới ưu đãi ${i + 1}`}
            aria-current={i === index}
            onClick={() => go(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-6 bg-[var(--accent-dark)]" : "w-1.5 bg-[var(--foreground)]/25"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
