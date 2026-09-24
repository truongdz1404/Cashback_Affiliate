import { proxyGet, proxyMutate } from "@/lib/api";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  return proxyMutate("/admin/shop-product-sync", "POST", body);
}

// Polled while a crawl is running, same reason as /api/product-offer-sync: even
// a single shop is several page loads behind a select-all and a CSV download,
// which outlives Cloudflare's ~100s upstream timeout.
export async function GET() {
  return proxyGet("/admin/shop-product-sync");
}
