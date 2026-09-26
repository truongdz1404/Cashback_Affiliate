import { proxyGet } from "@/lib/api";

// `?probe=1` makes the API call Shopee live rather than answering from its own
// counters - that is the whole point here, the dashboard needs to know what
// Shopee thinks of the account right now, not what it thought last time
// something happened to call it.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  return proxyGet(`/admin/shopee-api/health${qs ? `?${qs}` : ""}`);
}
