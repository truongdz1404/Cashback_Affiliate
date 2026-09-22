import { proxyGet, proxyMutate } from "@/lib/api";

export async function GET() {
  return proxyGet("/admin/app-config");
}

export async function PUT(req) {
  const body = await req.json();
  return proxyMutate("/admin/app-config", "PUT", body);
}
