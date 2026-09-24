import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appFetchSafe, getSessionUser } from "@/lib/appApi";
import type { Bank } from "@/lib/appTypes";
import { hasBankAccount } from "@/components/account/menu";
import { PageHeading, SectionCard, StatusPill } from "@/components/account/ui";
import BankAccountForm from "@/components/account/BankAccountForm";
import { ShieldIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Tài khoản ngân hàng | Rewally" };

export default async function BankPage() {
  const [user, banks] = await Promise.all([getSessionUser(), appFetchSafe<Bank[]>("/banks", [])]);
  if (!user) redirect("/login?next=/account/bank");

  const configured = hasBankAccount(user);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Tài khoản ngân hàng" description="Nơi Rewally chuyển tiền hoàn mỗi khi bạn rút tiền." />

      <SectionCard
        title="Thông tin nhận tiền"
        action={<StatusPill label={configured ? "Đã thiết lập" : "Chưa thiết lập"} tone={configured ? "success" : "warning"} />}
      >
        {!configured && (
          <p className="mb-4 rounded-xl bg-[var(--warning)]/12 px-3.5 py-3 text-sm font-semibold text-[#9A6B00]">
            Bạn cần thiết lập tài khoản ngân hàng trước khi tạo yêu cầu rút tiền.
          </p>
        )}
        <BankAccountForm user={user} banks={banks} />
      </SectionCard>

      <div className="flex gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        <ShieldIcon className="h-5 w-5 shrink-0 text-[var(--accent-dark)]" />
        <p className="leading-relaxed">
          Tên chủ tài khoản cần trùng với tên đăng ký tại ngân hàng. Yêu cầu rút tiền về tài khoản sai thông tin sẽ bị từ
          chối và bạn có thể tạo lại sau khi sửa.
        </p>
      </div>
    </div>
  );
}
