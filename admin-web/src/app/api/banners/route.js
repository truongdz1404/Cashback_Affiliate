import { proxyGet, proxyMutate } from "@/lib/api";

export async function GET() {
  return proxyGet("/admin/banners");
}

export async function POST(req) {
  const body = await req.json();
  return proxyMutate("/admin/banners", "POST", body);
}
