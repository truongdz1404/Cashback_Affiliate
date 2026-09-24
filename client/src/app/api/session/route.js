import { proxyGet, proxyMutate } from "@/lib/api";

export async function GET() {
  return proxyGet("/admin/session-status");
}

export async function POST(req) {
  const body = await req.json();
  return proxyMutate("/admin/session-cookie", "POST", body);
}
