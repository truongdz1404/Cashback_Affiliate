export default function StatCard({ label, value, sub, tone = "default" }) {
  const toneClass =
    tone === "warning" ? "text-amber-600" : tone === "success" ? "text-emerald-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
