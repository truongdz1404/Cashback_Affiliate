import { proxyMutate } from "@/lib/api";

// One live call to Shopee's shop-detail API, answered synchronously - unlike
// the crawl endpoints there is no browser involved, so it finishes in well
// under a second.
export async function POST(_req, { params }) {
  const { id } = await params;
  return proxyMutate(`/admin/shops/${encodeURIComponent(id)}/refresh`, "POST", {});
}
