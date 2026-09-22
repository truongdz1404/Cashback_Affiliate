import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/appApi";
import { displayName } from "@/lib/format";
import AccountNav from "@/components/account/AccountNav";

// Every account page reads live balances - nothing here may be cached.
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // proxy.js already blocks /account/* without a user_token cookie; this
  // catches the other case - a cookie that the backend no longer honours.
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");

  return (
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
      <header className="flex items-center gap-3.5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-lg font-extrabold text-[var(--accent-foreground)]">
          {displayName(user).trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold text-[var(--foreground)] sm:text-2xl">
            {displayName(user)}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {user.phone ?? user.email ?? "Tài khoản Rewally"}
          </p>
        </div>
      </header>

      <div className="mt-6 gap-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <AccountNav />
        </aside>
        <div className="mt-6 min-w-0 lg:mt-0">{children}</div>
      </div>
    </div>
  );
}
