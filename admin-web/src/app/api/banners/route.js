import { proxyGet, proxyMutate } from "@/lib/api";

export async function GET(req) {
  // The dashboard keeps one tab per surface, so the list is always asked for
  // by platform; the backend defaults to "app" when it is missing.
  const platform = new URL(req.url).searchParams.get("platform");
  return proxyGet(`/admin/banners${platform ? `?platform=${encodeURIComponent(platform)}` : ""}`);
}

export async function POST(req) {
  const body = await req.json();
  return proxyMutate("/admin/banners", "POST", body);
}
