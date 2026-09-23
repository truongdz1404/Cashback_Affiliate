import { proxyMutate } from "@/lib/api";

export async function PUT(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  return proxyMutate(`/admin/shops/${encodeURIComponent(id)}`, "PUT", body);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  return proxyMutate(`/admin/shops/${encodeURIComponent(id)}`, "DELETE");
}
