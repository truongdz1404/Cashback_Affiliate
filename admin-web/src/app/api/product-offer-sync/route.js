import { proxyGet, proxyMutate } from "@/lib/api";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  return proxyMutate("/admin/product-offer-sync", "POST", body);
}

// Polled by the settings page while a sync is running - the backend runs the
// crawl in the background now instead of blocking the POST above, since a
// held-open connection through Cloudflare hits its own ~100s upstream
// timeout well before a multi-page crawl finishes.
export async function GET() {
  return proxyGet("/admin/product-offer-sync");
}
