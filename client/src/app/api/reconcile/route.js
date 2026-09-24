import { proxyMutate } from "@/lib/api";

export async function POST() {
  return proxyMutate("/admin/reconcile", "POST");
}
