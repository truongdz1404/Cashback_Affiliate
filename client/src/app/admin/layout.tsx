import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/appApi";
import { displayName } from "@/lib/format";
import AdminShell from "@/components/admin/AdminShell";

// The dashboard is not a place you can find: for guests and ordinary members
// this route tree answers exactly like any other missing URL (the root
// not-found page), with no redirect and no "sign in as admin" hint. Only an
// account whose backend role is "admin" gets the shell - and the backend
// still re-checks that role on every /admin/* API call the shell makes.
export const dynamic = "force-dynamic";

// Static `metadata` here would still be applied to the 404 rendered below
// and put "Quản trị" in the tab title of a page that claims not to exist.
// getSessionUser is cached per request, so this costs no extra round trip.
export async function generateMetadata(): Promise<Metadata> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return { title: "Trang không tồn tại | Rewally" };
  return { title: "Quản trị | Rewally", robots: { index: false, follow: false } };
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") notFound();

  return (
    <AdminShell admin={{ name: displayName(user), contact: user.email ?? user.phone ?? "" }}>
      {children}
    </AdminShell>
  );
}
