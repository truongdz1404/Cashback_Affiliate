import NavBar from "@/components/NavBar";

export default function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
