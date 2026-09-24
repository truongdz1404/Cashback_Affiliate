import { proxyMutate } from "@/lib/api";

// Grant or revoke the dashboard for one account. The backend refuses to let
// an admin demote themselves or the last remaining admin; its message is
// passed through as-is so the table can show it.
export async function PUT(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  return proxyMutate(`/admin/users/${encodeURIComponent(id)}/role`, "PUT", body);
}
