import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";
import { Card, Chip } from "@heroui/react";
import ProductRail from "@/components/public/ProductRail";
import ShopRail from "@/components/public/ShopRail";
import CampaignCard from "@/components/public/CampaignCard";
import PlaceholderImage from "@/components/public/PlaceholderImage";
import HowItWorks from "@/components/public/HowItWorks";
import LinkTool from "@/components/public/LinkTool";
import BannerCarousel from "@/components/public/BannerCarousel";
import { PLAY_STORE_URL } from "@/lib/site";
import { formatPct, formatVnd } from "@/lib/format";
import type { Banner, Campaign, Shop, ShoppingCategory, ShoppingProduct } from "@/lib/appTypes";
import {
  ArrowRightIcon,
  BagIcon,
  BoltIcon,
  DownloadIcon,
  FireIcon,
  GiftIcon,
  GridIcon,
  ImageIcon,
  ReceiptIcon,
  ShieldIcon,
  StarIcon,
  WalletIcon,
} from "@/components/icons";

const STEPS = [
  {
    title: "Tìm sản phẩm yêu thích",
    description: "Chọn sản phẩm hoặc danh mục đang có hoàn tiền trên Rewally.",
  },
  {
    title: "Mua hàng qua Rewally",
    description: "Rewally mở Shopee bằng link riêng để đơn hàng được ghi nhận.",
  },
  {
    title: "Nhận tiền về ví",
    description: "Sau khi đơn hoàn tất và đối soát, tiền hoàn được cộng vào ví.",
  },
];

const TRUST = [
  {
    icon: ShieldIcon,
    title: "Không phát sinh phí",
    description: "Bạn mua đúng giá Shopee niêm yết. Rewally chia lại hoa hồng tiếp thị cho bạn.",
  },
  {
    icon: ReceiptIcon,
    title: "Theo dõi theo từng đơn",
    description: "Mỗi khoản hoàn tiền gắn với đơn hàng thật, dễ kiểm tra trong tài khoản.",
  },
  {
    icon: WalletIcon,
    title: "Rút về ngân hàng",
    description: "Tiền trong ví có thể rút về tài khoản ngân hàng chính chủ, không đổi sang điểm.",
  },
];

export default function MarketingHome({
  categories,
  productCount,
  topCashback,
  bestSellers,
  xtra,
  shops,
  campaigns,
  banners,
}: {
  categories: ShoppingCategory[];
  productCount: number;
  topCashback: ShoppingProduct[];
  bestSellers: ShoppingProduct[];
  xtra: ShoppingProduct[];
  shops: Shop[];
  campaigns: Campaign[];
  banners: Banner[];
}) {
  const bestRate = topCashback.reduce<number>((max, p) => Math.max(max, p.userCommissionRateValue ?? 0), 0);
  const stats =
    productCount > 0
      ? ([
          { value: productCount.toLocaleString("vi-VN"), label: "Sản phẩm hoàn tiền" },
          categories.length > 0 && { value: categories.length.toLocaleString("vi-VN"), label: "Danh mục mua sắm" },
          bestRate > 0 && { value: `Đến ${formatPct(bestRate)}`, label: "Tỷ lệ hoàn tiền" },
          { value: "0đ", label: "Phí tham gia" },
        ].filter(Boolean) as { value: string; label: string }[])
      : [];

  return (
    <main className="overflow-hidden bg-[var(--background)] pb-14">
      <section className="relative bg-[linear-gradient(135deg,var(--accent)_0%,var(--accent)_46%,#9BE0B6_100%)] text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:pb-24 lg:pt-14">
          <div className="relative z-10 max-w-xl">
            <Chip color="success" variant="soft" size="sm" className="bg-white/18 text-white">
              Miễn phí tham gia
            </Chip>
            <h1 className="mt-5 max-w-lg text-[2.35rem] font-extrabold leading-[1.06] tracking-normal sm:text-5xl">
              Cứ mua sắm là được hoàn tiền
            </h1>
            <p className="mt-4 max-w-md text-sm font-medium leading-6 text-white/88 sm:text-[15px]">
              Mua hàng Shopee như bình thường, chỉ cần đi qua Rewally. Hoàn tiền được ghi nhận theo đơn và rút về ngân
              hàng khi đủ điều kiện.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--foreground)] px-5 text-sm font-extrabold text-white shadow-[0_16px_36px_-20px_rgba(0,0,0,0.7)] transition hover:opacity-90"
              >
                Tham gia nhận hoàn tiền ngay
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <Link
                href="/products"
                className="inline-flex h-11 items-center rounded-full border border-white/45 px-5 text-sm font-bold text-white transition hover:bg-white/12"
              >
                Xem sản phẩm
              </Link>
            </div>
          </div>

          <div className="relative mx-auto aspect-[16/9] w-full max-w-[620px] overflow-hidden rounded-[30px] shadow-[0_28px_76px_-36px_rgba(20,49,34,0.7)]">
            <Image
              src="/marketing/cashback-hero.png"
              alt="Minh họa hoàn tiền Rewally với ví, đồng xu và các danh mục mua sắm"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 620px"
              className="object-cover object-center"
            />
          </div>
        </div>
      </section>

      {stats.length > 0 && (
        <div className="mx-auto -mt-10 max-w-5xl px-4 sm:px-6">
          <Card className="overflow-hidden rounded-[22px] border border-[var(--border)] shadow-[0_18px_48px_-28px_rgba(20,49,34,0.55)]">
            <Card.Content className="grid grid-cols-2 p-0 lg:grid-cols-4">
              {stats.map((stat, index) => (
                <div
                  key={stat.label}
                  className={`px-5 py-5 text-center ${index % 2 === 1 ? "border-l border-[var(--border)]" : ""} ${
                    index >= 2 ? "border-t border-[var(--border)] lg:border-t-0" : ""
                  } ${index > 0 ? "lg:border-l lg:border-[var(--border)]" : ""}`}
                >
                  <p className="text-xl font-extrabold text-[var(--foreground)] sm:text-2xl">{stat.value}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{stat.label}</p>
                </div>
              ))}
            </Card.Content>
          </Card>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Operator-managed artwork from the "Banner web" list. These are
            full-width heroes in their own right - 2.4:1, with their own
            headline and button - so they get the whole column here rather
            than being shrunk into the green block above. The carousel
            renders null on an empty list, hence the guard: without it the
            margin below would leave a gap over the link tool. */}
        {banners.length > 0 && (
          <section className="mt-12">
            <BannerCarousel banners={banners} />
          </section>
        )}

        {/* The paste-a-link tool is the main revenue action: give it the first
            slot after the hero, on both the guest and the signed-in home. */}
        <section className="mt-12 grid items-center gap-6 rounded-[28px] bg-white p-5 shadow-[0_24px_60px_-40px_rgba(20,49,34,0.6)] ring-1 ring-[var(--border)] sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-extrabold text-[var(--accent-dark)]">
              <BoltIcon className="h-3.5 w-3.5" />
              Hoàn tiền cho mọi sản phẩm Shopee
            </span>
            <h2 className="mt-3 text-2xl font-extrabold leading-tight text-[var(--foreground)] sm:text-3xl">
              Đã có sản phẩm muốn mua? Dán link vào đây
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
              Không cần tìm trong danh sách. Sao chép link sản phẩm từ Shopee, dán vào Rewally và nhận link hoàn tiền
              kèm số tiền hoàn dự kiến.
            </p>
          </div>
          <LinkTool isAuthenticated={false} variant="hero" />
        </section>

        {topCashback.length > 0 && (
          <section className="pt-12">
            <SectionHeading title="Thương hiệu nổi bật" href="/products?sort=commission_desc" />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {topCashback.slice(0, 10).map((product) => (
                <FeaturedTile key={product.id} product={product} />
              ))}
            </div>
          </section>
        )}

        {categories.length > 0 && (
          <section className="pt-12">
            <SectionHeading title="Danh mục phổ biến" href="/products" />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {categories.slice(0, 12).map((category) => (
                <Link
                  key={category.category}
                  href={`/products?category=${encodeURIComponent(category.category)}`}
                  className="group rounded-2xl border border-[var(--border)] bg-white p-3 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-[0_18px_34px_-26px_rgba(20,49,34,0.55)]"
                >
                  <PlaceholderImage label={category.category} icon={GridIcon} className="h-20 w-full rounded-xl" />
                  <p className="mt-3 line-clamp-1 text-sm font-extrabold text-[var(--foreground)]">{category.category}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">
                    {category.count.toLocaleString("vi-VN")} sản phẩm
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <section className="mt-12 grid lg:grid-cols-2">
        <SplitPanel
          tone="blue"
          title="Mua sắm, đặt đơn và nhận hoàn tiền"
          description="Không cần tích điểm hay nhập mã. Chọn sản phẩm trên Rewally, mua hàng ở Shopee, phần hoàn tiền sẽ tự cập nhật sau đối soát."
          cta={{ href: "/products", label: "Mua sắm ngay" }}
          image={{ label: "Minh họa các danh mục mua sắm", icon: BagIcon, src: "/marketing/shopping-categories.png" }}
        />
        <SplitPanel
          tone="mint"
          title="Nhiều cách nhận thưởng hơn"
          description="Ngoài hoàn tiền theo đơn, bạn còn nhận thưởng theo chiến dịch và hoa hồng trên mỗi đơn hàng của bạn bè do bạn giới thiệu."
          cta={{ href: "/campaigns", label: "Xem ưu đãi" }}
          image={{ label: "Minh họa thưởng hoàn tiền", icon: GiftIcon, src: "/marketing/reward-ways.png" }}
        />
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <HowItWorks />

        <ProductRail
          title="Ưu đãi hoàn tiền tốt nhất"
          subtitle="Sản phẩm đang có tỷ lệ hoàn tiền nổi bật"
          href="/products?sort=commission_desc"
          products={topCashback}
          isAuthenticated={false}
          accent={<StarIcon className="h-4 w-4 text-[var(--accent)]" />}
        />

        <ShopRail shops={shops} subtitle="Cửa hàng đang có tỷ lệ hoàn tiền cao nhất trên Rewally" />

        <ProductRail
          title="Bán chạy nhất"
          subtitle="Những sản phẩm được mua nhiều trên Shopee"
          href="/products?bestSeller=1"
          products={bestSellers}
          isAuthenticated={false}
          accent={<FireIcon className="h-4 w-4 text-[var(--danger)]" />}
        />

        <ProductRail
          title="Hoa hồng Xtra"
          subtitle="Shop tham gia chương trình hoa hồng mở rộng của Shopee"
          href="/products?xtra=1"
          products={xtra}
          isAuthenticated={false}
          accent={<BoltIcon className="h-4 w-4 text-[var(--warning)]" />}
        />

        {campaigns.length > 0 && (
          <section className="py-8">
            <SectionHeading title="Ưu đãi & Sự kiện" href="/campaigns" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {campaigns.slice(0, 4).map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} isAuthenticated={false} />
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-4 py-8 lg:grid-cols-3">
          {TRUST.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="rounded-2xl border border-[var(--border)]">
              <Card.Content className="p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-sm font-extrabold text-[var(--foreground)]">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{description}</p>
              </Card.Content>
            </Card>
          ))}
        </section>

        <section className="mt-8 overflow-hidden rounded-[28px] bg-[#ffd8d1]">
          <div className="grid items-center gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[1fr_1fr]">
            <div>
              <Chip color="danger" variant="soft" size="sm">
                Ứng dụng Rewally
              </Chip>
              <h2 className="mt-5 max-w-md text-2xl font-extrabold leading-tight text-[var(--foreground)] sm:text-3xl">
                Theo dõi hoàn tiền gọn hơn trên điện thoại
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
                Xem đơn hàng, ví hoàn tiền, tạo link và gửi yêu cầu rút tiền ngay trong ứng dụng.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Image
                  src="/play-store-qr.png"
                  alt="Mã QR tải ứng dụng Rewally"
                  width={104}
                  height={104}
                  className="rounded-2xl border border-black/10 bg-white p-1"
                />
                <Link
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--foreground)] px-5 text-sm font-extrabold text-white"
                >
                  <DownloadIcon className="h-4 w-4" />
                  Tải trên Google Play
                </Link>
              </div>
            </div>
            <PlaceholderImage
              label="Ảnh chụp màn hình ứng dụng"
              icon={WalletIcon}
              tone="surface"
              src="/marketing/app-wallet-mockup.png"
              className="mx-auto h-72 w-full max-w-[300px] rounded-[26px]"
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function SectionHeading({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-xl font-extrabold text-[var(--foreground)]">{title}</h2>
      {href && (
        <Link href={href} className="shrink-0 text-sm font-extrabold text-[var(--accent)] hover:underline">
          Xem tất cả
        </Link>
      )}
    </div>
  );
}

function FeaturedTile({ product }: { product: ShoppingProduct }) {
  const pct = product.userCommissionRateValue;
  const amount = product.userCommissionValue;
  const reward = amount != null && amount > 0 ? formatVnd(amount) : pct != null && pct > 0 ? formatPct(pct) : "Có hoàn tiền";

  return (
    <Link
      href="/products"
      className="group rounded-2xl border border-[var(--border)] bg-white p-3 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-[0_18px_34px_-26px_rgba(20,49,34,0.55)]"
    >
      <div className="relative flex aspect-[2/1] items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-secondary)]">
        {product.imageUrl ? (
          <Image src={product.imageUrl} alt={product.name} fill sizes="220px" className="object-contain p-2" />
        ) : (
          <ImageIcon className="h-7 w-7 text-[var(--muted)]" />
        )}
      </div>
      <p className="mt-2 line-clamp-1 text-xs font-semibold text-[var(--muted)]">{product.shopName || product.name}</p>
      <p className="line-clamp-1 text-xs font-extrabold text-[var(--foreground)]">Hoàn {reward}</p>
    </Link>
  );
}

function SplitPanel({
  tone,
  title,
  description,
  cta,
  image,
}: {
  tone: "blue" | "mint";
  title: string;
  description: string;
  cta: { href: string; label: string };
  image: { label: string; icon: ComponentType<{ className?: string }>; src?: string };
}) {
  const background = tone === "blue" ? "bg-[#e6f7fb]" : "bg-[#e8f8ee]";

  return (
    <div className={`${background} px-6 py-14 text-center sm:px-10`}>
      <PlaceholderImage
        label={image.label}
        icon={image.icon}
        tone="surface"
        src={image.src}
        className="mx-auto h-56 w-full max-w-[360px] rounded-[24px]"
      />
      <h2 className="mx-auto mt-7 max-w-md text-2xl font-extrabold leading-tight text-[var(--foreground)]">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">{description}</p>
      <Link href={cta.href} className="mt-6 inline-flex rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-extrabold text-white">
        {cta.label}
      </Link>
    </div>
  );
}
