import { proxyMutate } from "@/lib/api";

export async function PUT(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  return proxyMutate(`/admin/orders/${encodeURIComponent(id)}/payout`, "PUT", body);
}
