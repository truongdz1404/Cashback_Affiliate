import { proxyGet } from "@/lib/api";

export async function GET(req, { params }) {
  const { id } = await params;
  const qs = req.nextUrl.search || "";
  return proxyGet(`/admin/users/${encodeURIComponent(id)}/orders${qs}`);
}
