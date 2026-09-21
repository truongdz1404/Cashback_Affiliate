import { proxyMutate } from "@/lib/api";

export async function POST(req) {
  const body = await req.json();
  return proxyMutate("/admin/campaigns/tier-calculator", "POST", body);
}
