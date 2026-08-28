import { proxyGet } from "@/lib/api";

export async function GET(req) {
  const qs = req.nextUrl.search || "";
  return proxyGet(`/admin/withdrawals${qs}`);
}
