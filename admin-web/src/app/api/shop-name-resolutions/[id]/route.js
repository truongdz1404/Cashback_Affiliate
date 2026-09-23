import { proxyMutate } from "@/lib/api";

// An admin picking the right shop by hand - the only way out of `ambiguous`,
// where two shops genuinely share a display name and no rule can break the tie.
export async function PUT(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  return proxyMutate(`/admin/shop-name-resolutions/${encodeURIComponent(id)}`, "PUT", body);
}
