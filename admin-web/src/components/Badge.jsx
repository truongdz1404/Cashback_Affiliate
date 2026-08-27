const TONES = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
};

export default function Badge({ tone = "slate", children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone] || TONES.slate}`}>
      {children}
    </span>
  );
}
