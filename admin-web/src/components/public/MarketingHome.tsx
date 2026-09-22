import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";
import { Card, Chip } from "@heroui/react";
import ProductRail from "@/components/public/ProductRail";
import CampaignCard from "@/components/public/CampaignCard";
import PlaceholderImage from "@/components/public/PlaceholderImage";
import { PLAY_STORE_URL } from "@/lib/site";
import { formatPct, formatVnd } from "@/lib/format";
import type { Campaign, ShoppingCategory, ShoppingProduct } from "@/lib/appTypes";
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
  campaigns,
}: {
  categories: ShoppingCategory[];
  productCount: number;
  topCashback: ShoppingProduct[];
  bestSellers: ShoppingProduct[];
  xtra: ShoppingProduct[];
  campaigns: Campaign[];
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

          <div className="relative mx-auto h-[340px] w-full max-w-[520px] lg:h-[390px]">
            <div className="absolute left-3 top-6 rotate-[-7deg] rounded-[22px] bg-white p-3 shadow-[0_24px_60px_-28px_rgba(20,49,34,0.65)] sm:left-8">
              <HeroMiniCard title="Mua sắm" subtitle="Hoàn đến 12%" icon={BagIcon} tone="green" />
            </div>
            <div className="absolute right-2 top-2 rotate-[8deg] rounded-[22px] bg-white p-3 shadow-[0_24px_60px_-28px_rgba(20,49,34,0.65)] sm:right-10">
              <HeroMiniCard title="Săn deal" subtitle="Ưu đãi mỗi ngày" icon={GiftIcon} tone="warm" />
            </div>
            <div className="absolute inset-x-8 bottom-4 rounded-[28px] bg-white p-4 text-[var(--foreground)] shadow-[0_28px_70px_-30px_rgba(20,49,34,0.75)] sm:inset-x-16">
              <div className="relative mx-auto flex aspect-[4/3] max-w-[300px] items-center justify-center overflow-hidden rounded-2xl bg-[var(--accent-soft)]">
                <Image src="/mascot.png" alt="" width={220} height={220} priority className="w-44 sm:w-52" />
                <div className="absolute bottom-4 left-4 rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[var(--accent)] shadow">
                  + Hoàn tiền
                </div>
              </div>
            </div>
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
          image={{ label: "Minh họa các danh mục mua sắm", icon: BagIcon }}
        />
        <SplitPanel
          tone="mint"
          title="Nhiều cách nhận thưởng hơn"
          description="Ngoài hoàn tiền theo đơn, bạn còn có thể nhận thêm thưởng theo chiến dịch và giới thiệu bạn bè."
          cta={{ href: "/campaigns", label: "Xem ưu đãi" }}
          image={{ label: "Minh họa thưởng hoàn tiền", icon: GiftIcon }}
        />
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid items-center gap-10 py-16 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="mx-auto w-full max-w-md">
            <div className="relative h-72">
              <Card className="absolute left-4 top-8 w-52 rotate-[-5deg] rounded-2xl shadow-[0_18px_44px_-28px_rgba(20,49,34,0.55)]">
                <Card.Content className="p-4">
                  <p className="text-xs font-bold text-[var(--muted)]">Đơn Shopee</p>
                  <p className="mt-1 text-2xl font-extrabold text-[var(--foreground)]">đến 30%</p>
                  <p className="text-xs font-semibold text-[var(--accent)]">Hoàn tiền</p>
                </Card.Content>
              </Card>
              <Card className="absolute right-4 top-20 w-48 rotate-[5deg] rounded-2xl shadow-[0_18px_44px_-28px_rgba(20,49,34,0.55)]">
                <Card.Content className="p-4">
                  <p className="text-xs font-bold text-[var(--muted)]">Ưu đãi Xtra</p>
                  <p className="mt-1 text-2xl font-extrabold text-[var(--foreground)]">+22%</p>
                  <p className="text-xs font-semibold text-[var(--accent)]">Tỷ lệ cao hơn</p>
                </Card.Content>
              </Card>
              <Link
                href="/products"
                className="absolute bottom-8 left-1/2 inline-flex -translate-x-1/2 rounded-full bg-[var(--foreground)] px-5 py-2.5 text-xs font-extrabold text-white shadow"
              >
                Đặt ngay
              </Link>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-extrabold leading-tight text-[var(--foreground)] sm:text-3xl">Cách hoạt động</h2>
            <ol className="mt-7 space-y-5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-4">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold ${
                      index === 1 ? "bg-[var(--foreground)] text-white" : "bg-[var(--surface)] text-[var(--muted)]"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-extrabold text-[var(--foreground)]">{step.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link
              href="/guide"
              className="mt-7 inline-flex rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-extrabold text-white transition hover:brightness-105"
            >
              Xem hướng dẫn chi tiết
            </Link>
          </div>
        </section>

        <ProductRail
          title="Ưu đãi hoàn tiền tốt nhất"
          subtitle="Sản phẩm đang có tỷ lệ hoàn tiền nổi bật"
          href="/products?sort=commission_desc"
          products={topCashback}
          isAuthenticated={false}
          accent={<StarIcon className="h-4 w-4 text-[var(--accent)]" />}
        />

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
  const reward = amount != null && amount > 0 ? formatVnd(amount) : pct != null && pct > 0 ? `${formatPct(pct)}%` : "Có hoàn tiền";

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

function HeroMiniCard({
  title,
  subtitle,
  icon: Icon,
  tone,
}: {
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  tone: "green" | "warm";
}) {
  return (
    <div className="flex w-40 items-center gap-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          tone === "green" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[#fff0c2] text-[#b77900]"
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-extrabold text-[var(--foreground)]">{title}</p>
        <p className="text-xs font-semibold text-[var(--muted)]">{subtitle}</p>
      </div>
    </div>
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
  image: { label: string; icon: ComponentType<{ className?: string }> };
}) {
  const background = tone === "blue" ? "bg-[#e6f7fb]" : "bg-[#e8f8ee]";

  return (
    <div className={`${background} px-6 py-14 text-center sm:px-10`}>
      <PlaceholderImage label={image.label} icon={image.icon} tone="surface" className="mx-auto h-36 w-full max-w-[320px]" />
      <h2 className="mx-auto mt-7 max-w-md text-2xl font-extrabold leading-tight text-[var(--foreground)]">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">{description}</p>
      <Link href={cta.href} className="mt-6 inline-flex rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-extrabold text-white">
        {cta.label}
      </Link>
    </div>
  );
}
