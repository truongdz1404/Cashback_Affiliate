"use client";

import { useState, type ReactNode } from "react";
import Sidebar, { type AdminIdentity } from "@/components/Sidebar";
import { MenuIcon, CloseIcon } from "@/components/icons";

// Client half of src/app/admin/layout.tsx: the role check lives in the
// server layout, this only owns the drawer state.
export default function AdminShell({ admin, children }: { admin: AdminIdentity; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[var(--border)] md:block">
        <Sidebar admin={admin} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-[var(--border)] shadow-xl">
            <Sidebar admin={admin} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="md:pl-64">
        <header className="flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 md:hidden">
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--foreground)] hover:bg-[var(--surface-secondary)]"
            aria-label="Menu"
          >
            {mobileOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
          <span className="text-sm font-semibold text-[var(--foreground)]">Rewally · Quản trị</span>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
