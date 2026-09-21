import { proxyMutate } from "@/lib/api";

export async function DELETE(_req, { params }) {
  const { id } = await params;
  return proxyMutate(`/admin/shopping-products/${encodeURIComponent(id)}`, "DELETE");
}
