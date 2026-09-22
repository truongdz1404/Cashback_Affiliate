import { getSessionUser } from "@/lib/appApi";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import { AuthDialogProvider } from "@/components/public/AuthDialog";

// Chrome shared by every visitor-facing page (home, catalog, campaigns,
// guide, and the signed-in /account area). /admin and the auth pages have
// their own layouts and deliberately do not get this header.
//
// The sign-in dialog is mounted here so any page can open it; getSessionUser
// is request-cached, so this does not add a backend call on top of the
// header's own lookup.
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <AuthDialogProvider isAuthenticated={user != null}>
      <div className="flex min-h-screen flex-col bg-[var(--background)]">
        <PublicHeader />
        <main className="flex-1">{children}</main>
        <PublicFooter />
      </div>
    </AuthDialogProvider>
  );
}
