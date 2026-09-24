import type { Metadata } from "next";
import AuthForm from "@/components/public/AuthForm";

export const metadata: Metadata = {
  title: "Đăng ký | Rewally",
  description: "Tạo tài khoản Rewally miễn phí và nhận hoàn tiền cho mọi đơn hàng Shopee.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const found = Array.isArray(value) ? value[0] : value;
  return found && found.trim() ? found.trim() : undefined;
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  // ?ref=CODE is what a referral link carries, ?referralCode= is accepted too.
  const referralCode = one(params, "ref") ?? one(params, "referralCode");
  return <AuthForm mode="register" next={one(params, "next")} referralCode={referralCode} />;
}
