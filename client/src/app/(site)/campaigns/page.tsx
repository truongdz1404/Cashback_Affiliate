import Link from "next/link";
import type { Metadata } from "next";
import { appFetchSafe, getSessionUser } from "@/lib/appApi";
import type { Campaign } from "@/lib/appTypes";
import CampaignCard from "@/components/public/CampaignCard";
import { formatVnd } from "@/lib/format";
import { GiftIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ưu đãi & Sự kiện | Rewally",
  description: "Các sự kiện thưởng theo mốc doanh số đang mở trên Rewally.",
};

export default async function CampaignsPage() {
  const [user, campaigns] = await Promise.all([
    getSessionUser(),
    appFetchSafe<Campaign[]>("/campaigns?limit=100", []),
  ]);

  const isAuthenticated = user != null;
  const active = campaigns.filter((c) => c.isActive);
  const closed = campaigns.filter((c) => !c.isActive);
  const totalReward = campaigns.reduce(
    (sum, c) => sum + c.rewardsEarned.reduce((inner, r) => inner + r.rewardAmount, 0),
    0,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
      <header>
        <h1 className="text-2xl font-extrabold text-[var(--foreground)] sm:text-3xl">Ưu đãi & Sự kiện</h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">Theo dõi mốc thưởng và quyền lợi đang mở.</p>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-2xl font-extrabold text-[var(--foreground)]">{active.length}</p>
          <p className="text-sm text-[var(--muted)]">Sự kiện đang mở</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-2xl font-extrabold text-[var(--accent)]">
            {isAuthenticated ? formatVnd(totalReward) : "—"}
          </p>
          <p className="text-sm text-[var(--muted)]">Tổng thưởng đã nhận</p>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-[var(--border)] px-6 py-16 text-center">
          <GiftIcon className="h-8 w-8 text-[var(--muted)]" />
          <p className="mt-4 text-base font-extrabold text-[var(--foreground)]">Chưa có sự kiện nào</p>
          <p className="mt-1.5 max-w-sm text-sm text-[var(--muted)]">
            Hiện chưa có chương trình thưởng nào đang chạy. Trong lúc chờ, bạn vẫn nhận hoàn tiền cho mọi đơn hàng.
          </p>
          <Link
            href="/products"
            className="mt-5 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-extrabold text-[var(--accent-foreground)]"
          >
            Mua sắm hoàn tiền
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-extrabold text-[var(--foreground)]">Đang mở</h2>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {active.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} isAuthenticated={isAuthenticated} />
                ))}
              </div>
            </section>
          )}

          {closed.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-extrabold text-[var(--foreground)]">Đã kết thúc</h2>
              <div className="mt-4 grid gap-4 opacity-80 lg:grid-cols-2">
                {closed.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} isAuthenticated={isAuthenticated} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
