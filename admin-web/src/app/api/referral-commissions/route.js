import { proxyGet } from "@/lib/api";

export async function GET(req) {
  return proxyGet(`/admin/referral-commissions${req.nextUrl.search}`);
}
