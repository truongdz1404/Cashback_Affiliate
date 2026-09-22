import Image from "next/image";
import Link from "next/link";
import ProductRail from "@/components/public/ProductRail";
import CampaignCard from "@/components/public/CampaignCard";
import PlaceholderImage from "@/components/public/PlaceholderImage";
import { PLAY_STORE_URL } from "@/lib/site";
import { formatPct } from "@/lib/format";
import type { Campaign, ShoppingCategory, ShoppingProduct } from "@/lib/appTypes";
import {
  BagIcon,
  BoltIcon,
  ClockIcon,
  DownloadIcon,
  FireIcon,
  GiftIcon,
  GridIcon,
  ReceiptIcon,
  ShieldIcon,
  StarIcon,
  UserPlusIcon,
  WalletIcon,
} from "@/components/icons";

// The logged-OUT home page. A visitor who has never heard of Rewally needs to
// be told what it is before being shown a wall of products, so this reads as
// a marketing page first and a catalog second - signed-in users get the
// straight product home in page.tsx instead.
//
// Several illustrations are still <PlaceholderImage>: the only artwork
// Rewally actually owns today is the mascot, the two app banners and the
// Play Store QR, and inventing partner logos or stock photos for the rest
// would put claims on the page that aren't true.

// Same four steps, same wording, as HowItWorks and the mobile app's
// ShoppingGuideModal - the cashback timeline must read identically
// everywhere or the "when do I get my money" expectation drifts.
const STEPS = [
  {
    icon: BagIcon,
    title: "Bấm vào sản phẩm trên Rewally",
    description: "Rewally chuyển bạn sang Shopee. Đặt hàng ngay trong phiên vừa mở để đơn được ghi nhận hoàn tiền.",
  },
  {
    icon: ClockIcon,
    title: "Sau khoảng 6 giờ, đơn hiện ra",
    description: "Đơn hàng xuất hiện trong mục Đơn hàng kèm số tiền hoàn dự kiến.",
  },
  {
    icon: ReceiptIcon,
    title: "Giao thành công, chờ đối soát",
    description: "Đơn chuyển sang trạng thái chờ đối soát với Shopee.",
  },
  {
    icon: WalletIcon,
    title: "7 ngày sau, tiền vào ví",
    description: "Tiền hoàn được cộng vào ví và rút về tài khoản ngân hàng của bạn.",
  },
];

const TRUST = [
  {
    icon: ShieldIcon,
    title: "Không phí, không mã giảm giá",
    description: "Bạn vẫn mua đúng giá Shopee niêm yết. Rewally chia lại phần hoa hồng tiếp thị cho bạn.",
  },
  {
    icon: ReceiptIcon,
    title: "Đối soát theo đơn hàng thật",
    description: "Mỗi đồng hoàn tiền đều gắn với một mã đơn Shopee bạn xem được trong tài khoản.",
  },
  {
    icon: WalletIcon,
    title: "Rút thẳng về ngân hàng",
    description: "Tiền trong ví rút về tài khoản ngân hàng chính chủ, không quy đổi sang điểm thưởng.",
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
  // Every figure below comes from the catalog itself. When the backend is
  // unreachable productCount is zero and the whole strip hides: a lone "0đ
  // phí tham gia" over an otherwise empty bar reads as broken, and inventing
  // the missing numbers is not an option.
  const bestRate = topCashback.reduce<number>((max, p) => Math.max(max, p.userCommissionRateValue ?? 0), 0);
  const stats =
    productCount > 0
      ? ([
          { value: productCount.toLocaleString("vi-VN"), label: "Sản phẩm đang hoàn tiền" },
          categories.length > 0 && { value: String(categories.length), label: "Ngành hàng" },
          bestRate > 0 && { value: `đến ${formatPct(bestRate)}`, label: "Tỉ lệ hoàn tiền cao nhất" },
          { value: "0đ", label: "Phí tham gia" },
        ].filter(Boolean) as { value: string; label: string }[])
      : [];

  return (
    <div className="pb-16">
      {/* ---------- Hero ---------- */}
      <section className="bg-[var(--accent)] text-[var(--accent-foreground)]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pb-24 lg:pt-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide">
              <StarIcon className="h-4 w-4" />
              Miễn phí tham gia
            </span>

            <h1 className="mt-5 text-3xl font-extrabold leading-[1.15] sm:text-4xl lg:text-5xl">
              Cứ mua sắm là được hoàn tiền
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed opacity-90 sm:text-base">
              Mua sắm trên Shopee như thường lệ, chỉ cần đi qua Rewally. Tiền hoàn được cộng vào ví sau khi đơn hoàn
              tất và đối soát, rồi rút thẳng về tài khoản ngân hàng của bạn.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="rounded-full bg-white px-7 py-3.5 text-sm font-extrabold text-[var(--accent)] transition hover:brightness-95"
              >
                Nhận hoàn tiền ngay
              </Link>
              <Link
                href="/products"
                className="rounded-full border-2 border-white/70 px-7 py-3.5 text-sm font-extrabold transition hover:bg-white/10"
              >
                Xem sản phẩm hoàn tiền
              </Link>
            </div>

            <p className="mt-5 text-sm opacity-85">
              Đã có tài khoản?{" "}
              <Link href="/login" className="font-extrabold underline underline-offset-4">
                Đăng nhập
              </Link>
            </p>
          </div>

          <div className="flex justify-center lg:justify-end">
            <Image
              src="/mascot.png"
              alt=""
              width={320}
              height={320}
              priority
              className="w-52 drop-shadow-2xl sm:w-64 lg:w-80"
            />
          </div>
        </div>
      </section>

      {/* ---------- Stats strip, floating over the hero ---------- */}
      {stats.length > 0 && (
        <div className="mx-auto -mt-12 max-w-7xl px-4 sm:px-6">
          <dl className="grid grid-cols-2 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-lg lg:grid-cols-4">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                // Hairline dividers between cells: left of every even cell on
                // phones, left of every cell but the first on desktop, and a
                // top rule for the second phone row.
                className={`flex flex-col-reverse px-5 py-6 text-center border-[var(--border)] ${
                  index % 2 === 1 ? "border-l" : ""
                } ${index >= 2 ? "border-t lg:border-t-0" : ""} ${index > 0 ? "lg:border-l" : ""}`}
              >
                <dt className="mt-1 text-xs font-semibold text-[var(--muted)] sm:text-sm">{stat.label}</dt>
                <dd className="text-2xl font-extrabold text-[var(--accent)] sm:text-3xl">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* ---------- Category tiles ---------- */}
        {categories.length > 0 && (
          <section className="pt-14">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-[var(--foreground)] sm:text-2xl">Ngành hàng nổi bật</h2>
                <p className="mt-1.5 text-sm text-[var(--muted)]">
                  Chọn ngành hàng bạn hay mua, mọi sản phẩm bên trong đều có hoàn tiền.
                </p>
              </div>
              <Link href="/products" className="whitespace-nowrap text-sm font-bold text-[var(--accent)] hover:underline">
                Xem tất cả
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {categories.slice(0, 12).map((category) => (
                <Link
                  key={category.category}
                  href={`/products?category=${encodeURIComponent(category.category)}`}
                  className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md"
                >
                  <PlaceholderImage label={category.category} icon={GridIcon} className="h-24 w-full" />
                  <p className="mt-3 line-clamp-1 text-sm font-extrabold text-[var(--foreground)]">
                    {category.category}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">
                    {category.count.toLocaleString("vi-VN")} sản phẩm
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Product rails ---------- */}
        <ProductRail
          title="Ưu đãi hoàn tiền tốt nhất"
          subtitle="Những sản phẩm đang trả tỉ lệ hoàn cao nhất hiện nay"
          href="/products?sort=commission_desc"
          products={topCashback}
          isAuthenticated={false}
          accent={<StarIcon className="h-5 w-5 text-[var(--accent)]" />}
        />

        <ProductRail
          title="Bán chạy nhất"
          subtitle="Sản phẩm được mua nhiều trên Shopee"
          href="/products?bestSeller=1"
          products={bestSellers}
          isAuthenticated={false}
          accent={<FireIcon className="h-5 w-5 text-[var(--danger)]" />}
        />

        {/* ---------- Two feature panels ---------- */}
        <section className="grid gap-5 pt-10 lg:grid-cols-2">
          <FeaturePanel
            tone="accent"
            eyebrow="Giới thiệu bạn bè"
            title="Rủ bạn cùng mua sắm, cả hai cùng nhận thưởng"
            description="Mỗi tài khoản có một mã giới thiệu riêng. Bạn bè đăng ký bằng mã của bạn và mua đơn đầu tiên, cả hai đều được cộng thưởng vào ví."
            cta={{ href: "/register", label: "Lấy mã giới thiệu" }}
            illustration={{ label: "Hai người bạn cùng mua sắm", icon: UserPlusIcon }}
          />
          <FeaturePanel
            tone="warm"
            eyebrow="Ưu đãi & Sự kiện"
            title="Mua đủ mốc doanh số, nhận thêm thưởng"
            description="Ngoài hoàn tiền theo từng đơn, Rewally còn có các chiến dịch thưởng theo mốc chi tiêu trong kỳ. Càng mua nhiều, phần thưởng càng lớn."
            cta={{ href: "/campaigns", label: "Xem ưu đãi đang chạy" }}
            illustration={{ label: "Quà thưởng theo mốc doanh số", icon: GiftIcon }}
          />
        </section>

        {/* ---------- How it works ---------- */}
        <section className="mt-12 overflow-hidden rounded-3xl bg-[var(--surface-secondary)]">
          <div className="grid items-center gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <h2 className="text-xl font-extrabold text-[var(--foreground)] sm:text-2xl">Cách hoạt động</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Bốn bước, không cần mã giảm giá, không cần nhập gì thêm.
              </p>

              <ol className="mt-7 flex flex-col gap-5">
                {STEPS.map(({ icon: Icon, title, description }, index) => (
                  <li key={title} className="flex gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-extrabold text-[var(--accent-foreground)]">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-extrabold text-[var(--foreground)]">
                        <Icon className="h-4 w-4 text-[var(--accent)]" />
                        {title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{description}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <Link
                href="/guide"
                className="mt-7 inline-flex rounded-full bg-[var(--accent)] px-7 py-3 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105"
              >
                Xem hướng dẫn chi tiết
              </Link>
            </div>

            <PlaceholderImage
              label="Minh hoạ hành trình hoàn tiền"
              icon={WalletIcon}
              tone="surface"
              className="h-64 w-full lg:h-80"
            />
          </div>
        </section>

        {/* ---------- Xtra rail ---------- */}
        <ProductRail
          title="Hoa hồng Xtra"
          subtitle="Shop tham gia chương trình hoa hồng mở rộng của Shopee"
          href="/products?xtra=1"
          products={xtra}
          isAuthenticated={false}
          accent={<BoltIcon className="h-5 w-5 text-[var(--warning)]" />}
        />

        {/* ---------- Campaigns ---------- */}
        {campaigns.length > 0 && (
          <section className="py-6">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-[var(--foreground)] sm:text-xl">
                  <GiftIcon className="h-5 w-5 text-[var(--accent)]" />
                  Ưu đãi & Sự kiện
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Mua đủ mốc doanh số để nhận thêm thưởng</p>
              </div>
              <Link href="/campaigns" className="whitespace-nowrap text-sm font-bold text-[var(--accent)] hover:underline">
                Xem tất cả
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {campaigns.slice(0, 4).map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} isAuthenticated={false} />
              ))}
            </div>
          </section>
        )}

        {/* ---------- Why Rewally ---------- */}
        <section className="pt-10">
          <h2 className="text-xl font-extrabold text-[var(--foreground)] sm:text-2xl">Vì sao chọn Rewally</h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {TRUST.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-sm font-extrabold text-[var(--foreground)]">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- App download ---------- */}
        <section className="mt-12 overflow-hidden rounded-3xl bg-[var(--accent-soft)]">
          <div className="grid items-center gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-[var(--accent-foreground)]">
                <DownloadIcon className="h-4 w-4" />
                Ứng dụng Rewally
              </span>
              <h2 className="mt-5 text-2xl font-extrabold leading-tight text-[var(--foreground)] sm:text-3xl">
                Theo dõi ví hoàn tiền ngay trên điện thoại
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
                Xem đơn hàng, số dư ví, tạo link hoàn tiền và yêu cầu rút tiền - tất cả trong ứng dụng Rewally.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-5">
                <Image
                  src="/play-store-qr.png"
                  alt="Mã QR tải ứng dụng Rewally trên Google Play"
                  width={132}
                  height={132}
                  className="rounded-2xl border border-[var(--border)] bg-white p-1"
                />
                <div className="flex flex-col gap-3">
                  <Link
                    href={PLAY_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-7 py-3 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Tải trên Google Play
                  </Link>
                  {/* No App Store badge: Rewally ships on Android only today,
                      and a dead iOS link would be worse than none. */}
                  <p className="text-xs font-semibold text-[var(--muted)]">
                    Quét mã QR bằng camera điện thoại để tải nhanh.
                  </p>
                </div>
              </div>
            </div>

            <PlaceholderImage
              label="Ảnh chụp màn hình ứng dụng"
              icon={WalletIcon}
              tone="surface"
              className="mx-auto h-72 w-full max-w-[260px]"
            />
          </div>
        </section>

        {/* ---------- Closing CTA ---------- */}
        <section className="mt-12 rounded-3xl bg-[var(--accent)] px-6 py-10 text-center text-[var(--accent-foreground)] sm:px-10">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Bắt đầu nhận hoàn tiền hôm nay</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm opacity-90 sm:text-base">
            Đăng ký chỉ mất một phút bằng số điện thoại hoặc tài khoản Google của bạn.
          </p>
          <Link
            href="/register"
            className="mt-7 inline-flex rounded-full bg-white px-8 py-3.5 text-sm font-extrabold text-[var(--accent)] transition hover:brightness-95"
          >
            Đăng ký miễn phí
          </Link>
        </section>
      </div>
    </div>
  );
}

function FeaturePanel({
  tone,
  eyebrow,
  title,
  description,
  cta,
  illustration,
}: {
  tone: "accent" | "warm";
  eyebrow: string;
  title: string;
  description: string;
  cta: { href: string; label: string };
  illustration: { label: string; icon: React.ComponentType<{ className?: string }> };
}) {
  // Two pastel panels sitting side by side, the "soft card" pattern the rest
  // of the site already uses for calm, non-urgent promotion.
  const background = tone === "accent" ? "bg-[var(--accent-soft)]" : "bg-[color-mix(in_oklab,var(--warning)_18%,white)]";

  return (
    <div className={`flex flex-col gap-6 rounded-3xl p-7 sm:flex-row sm:items-center ${background}`}>
      <div className="flex-1">
        <span className="text-xs font-extrabold uppercase tracking-wide text-[var(--muted)]">{eyebrow}</span>
        <h3 className="mt-2 text-lg font-extrabold leading-snug text-[var(--foreground)] sm:text-xl">{title}</h3>
        <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted)]">{description}</p>
        <Link
          href={cta.href}
          className="mt-5 inline-flex rounded-full bg-[var(--foreground)] px-6 py-2.5 text-sm font-extrabold text-white transition hover:opacity-90"
        >
          {cta.label}
        </Link>
      </div>
      <PlaceholderImage
        label={illustration.label}
        icon={illustration.icon}
        tone="surface"
        className="h-36 w-full sm:h-40 sm:w-40 sm:shrink-0"
      />
    </div>
  );
}
