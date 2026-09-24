import { proxyMutate } from "@/lib/api";

export async function PUT(_req, { params }) {
  const { id } = await params;
  return proxyMutate(`/admin/referral-commissions/${id}/payout`, "PUT", {});
}
