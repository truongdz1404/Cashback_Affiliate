import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

// Chrome shared by every visitor-facing page (home, catalog, campaigns,
// guide, and the signed-in /account area). /admin and the auth pages have
// their own layouts and deliberately do not get this header.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
