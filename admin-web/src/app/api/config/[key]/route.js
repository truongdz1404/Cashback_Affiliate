import { proxyMutate } from "@/lib/api";

export async function PUT(req, { params }) {
  const { key } = await params;
  const body = await req.json();
  return proxyMutate(`/admin/config/${encodeURIComponent(key)}`, "PUT", body);
}
