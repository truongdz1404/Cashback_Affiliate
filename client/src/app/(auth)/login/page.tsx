import type { Metadata } from "next";
import AuthForm from "@/components/public/AuthForm";

export const metadata: Metadata = {
  title: "Đăng nhập | Rewally",
  description: "Đăng nhập Rewally để xem ví hoàn tiền, đơn hàng và tạo link hoàn tiền.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const found = Array.isArray(value) ? value[0] : value;
  return found && found.trim() ? found.trim() : undefined;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return <AuthForm mode="login" next={one(params, "next")} />;
}
