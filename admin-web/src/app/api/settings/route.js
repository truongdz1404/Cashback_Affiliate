import { proxyGet, proxyMutate } from "@/lib/api";

export async function GET() {
  return proxyGet("/admin/settings");
}

export async function PUT(req) {
  const body = await req.json();
  return proxyMutate("/admin/settings", "PUT", body);
}
