import { proxyGet } from "@/lib/api";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  return proxyGet(`/admin/shops${qs ? `?${qs}` : ""}`);
}
