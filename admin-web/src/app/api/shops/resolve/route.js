import { proxyGet, proxyMutate } from "@/lib/api";

// Sits next to [id]/route.js, and wins for the literal path "resolve" because
// Next matches static segments before dynamic ones. Worth knowing before adding
// another shop id-shaped route here: a shop whose id were literally "resolve"
// would be unreachable, which is fine - ids are Shopee's numeric strings.

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  return proxyMutate("/admin/shops/resolve", "POST", body);
}

export async function GET() {
  return proxyGet("/admin/shops/resolve");
}
