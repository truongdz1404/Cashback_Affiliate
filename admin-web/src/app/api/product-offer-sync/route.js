import { proxyMutate } from "@/lib/api";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  return proxyMutate("/admin/product-offer-sync", "POST", body);
}
